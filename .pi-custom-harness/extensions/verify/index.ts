import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { runTool } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { VerifyCommandLiveLayer } from "../../lib/verify/live";
import { type VerifyReport, verify } from "./core";
import { type VerifyInput, VerifyParams } from "./schema";

/** Registers the repository-owned verification tool. */
export default function registerVerify(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "verify",
    label: "Verify",
    description:
      "Run repository-defined type, lint, test, or all checks in the worktree selected by file.",
    promptSnippet: "Run repository-defined verification checks",
    promptGuidelines: [
      "Pass a changed file path so verify resolves and runs inside that file's worktree.",
      "Use verify test --file for the changed test after each edit when the repository policy allows focused tests.",
      "Use verify all before shipping when the repository policy allows the complete check list.",
    ],
    parameters: VerifyParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: VerifyInput, signal, _onUpdate, ctx) {
      const effect = verify({ ...params, cwd: ctx.cwd }).pipe(
        Effect.provide(RepoMapLiveLayer),
        Effect.provide(VerifyCommandLiveLayer),
        Effect.map(
          (
            report,
          ): {
            content: Array<{ type: "text"; text: string }>;
            details: VerifyReport;
          } => ({
            content: [{ type: "text", text: JSON.stringify(report) }],
            details: report,
          }),
        ),
      );
      return runTool(effect, {
        signal,
        failurePrefix: "Verify",
        failureResult: (reason) => ({
          content: [{ type: "text", text: reason }],
          details: {
            ok: false,
            status: "interrupted",
            worktree: params.file ?? ctx.cwd,
            failures: [{ file: "", line: 0, rule: "verify", message: reason }],
            duration: 0,
          } satisfies VerifyReport,
        }),
      });
    },
  });
}
