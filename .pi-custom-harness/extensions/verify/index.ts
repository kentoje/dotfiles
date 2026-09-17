import { realpath } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapService } from "../../lib/repo-map/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { VerifyCommandLiveLayer } from "../../lib/verify/live";
import { type VerifyReport, verify } from "./core";
import { createVerifyExecutionCoordinator, runVerifyEffect } from "./execution";
import { verificationGitFingerprint } from "./fingerprint";
import { type VerifyInput, VerifyParams } from "./schema";

const verificationCoordinator = createVerifyExecutionCoordinator();

/** Registers focused verification and the user-invoked full verification command. */
export default function registerVerify(pi: ExtensionAPI): void {
  pi.registerCommand("harness-verify-all", {
    description:
      "Run repository-wide verification on explicit user request: /harness-verify-all [worktree].",
    handler: async (args, context) => {
      const requestedWorktree = args.trim() || context.cwd;
      let worktree: string;
      try {
        worktree = await realpath(requestedWorktree);
      } catch {
        context.ui.notify(
          `Full verification worktree does not exist: ${requestedWorktree}`,
          "error",
        );
        return;
      }
      context.ui.notify("Full verification started.", "info");
      const fingerprint = await verificationGitFingerprint(pi, worktree);
      const report = await verificationCoordinator.run({
        snapshot: {
          action: "all",
          worktree,
          file: undefined,
          fingerprint,
        },
        execute: () =>
          runVerifyEffect({
            effect: verify({ action: "all", cwd: worktree }).pipe(
              Effect.provide(RepoMapLiveLayer),
              Effect.provide(VerifyCommandLiveLayer),
            ),
            signal: context.signal,
            worktree,
          }),
      });
      context.ui.notify(
        report.ok
          ? `Full verification passed for ${report.worktree}.`
          : `Full verification failed for ${report.worktree} with ${report.failures.length} failure(s).`,
        report.ok ? "info" : "error",
      );
    },
  });

  pi.registerTool({
    name: "verify",
    label: "Verify",
    description:
      "Run one focused repository-defined type, lint, or test check in the worktree selected by file.",
    promptSnippet: "Run focused repository-defined verification checks",
    promptGuidelines: [
      "Pass a changed file path so verify resolves and runs inside that file's worktree.",
      "Use one focused check after relevant edits; repository-wide verification is user-activated with /harness-verify-all.",
    ],
    parameters: VerifyParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: VerifyInput, signal, _onUpdate, ctx) {
      const lookupPath = params.file ?? ctx.cwd;
      const facts = await runHandler(
        RepoMapService.use((service) =>
          service.repositoryFactsFor({ cwd: lookupPath }),
        ).pipe(Effect.provide(RepoMapLiveLayer)),
        { signal, failurePrefix: "Verify" },
      );
      if ("block" in facts) {
        return {
          content: [{ type: "text", text: facts.reason }],
          details: {
            ok: false,
            status: "completed",
            worktree: ctx.cwd,
            failures: [
              { file: "", line: 0, rule: "verify", message: facts.reason },
            ],
            duration: 0,
          } satisfies VerifyReport,
        };
      }
      const fingerprint = await verificationGitFingerprint(
        pi,
        facts.repositoryRoot,
      );
      const report = await verificationCoordinator.run({
        snapshot: {
          action: params.action,
          worktree: facts.repositoryRoot,
          file: params.file,
          fingerprint,
        },
        execute: () =>
          runVerifyEffect({
            effect: verify({ ...params, cwd: ctx.cwd }).pipe(
              Effect.provide(RepoMapLiveLayer),
              Effect.provide(VerifyCommandLiveLayer),
            ),
            signal,
            worktree: facts.repositoryRoot,
          }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(report) }],
        details: report,
      };
    },
  });
}
