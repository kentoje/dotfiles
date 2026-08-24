// Pi entrypoint intentionally owns only schema validation, queueing, and result mapping.

import { homedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import {
  runWorktreeTool,
  WorktreeMutationError,
  WorktreeMutationService,
  type WorktreeToolError,
} from "../../lib/worktree/core";
import { WorktreeLiveLayer } from "../../lib/worktree/live";
import { type WorktreeInput, WorktreeParams } from "./schema";

const expandHome = (path: string): string =>
  path === "~"
    ? homedir()
    : path.startsWith("~/")
      ? `${homedir()}${path.slice(1)}`
      : path;

type WorktreeTextContent = { type: "text"; text: string };
type WorktreeSuccessResult = {
  content: Array<WorktreeTextContent>;
  details: unknown;
};
type WorktreeFailureResult = {
  content: Array<WorktreeTextContent>;
  details: unknown;
  isError: true;
};

const failureText = (reason: string): WorktreeFailureResult => ({
  content: [{ type: "text", text: reason }],
  details: {},
  isError: true,
});

const successText = (value: unknown): WorktreeSuccessResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  details: value,
});

/** Registers the worktree actions and queues each absolute mutation at the Pi boundary. */
export default function registerWorktreeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "worktree",
    label: "Worktree",
    description: "Create, verify, list, or safely remove task worktrees.",
    promptSnippet: "Create and verify repository task worktrees.",
    promptGuidelines: [
      "Use worktree new before editing a task checkout.",
      "Use worktree verify when a checkout may be missing repository setup.",
      "Use worktree rm only for a recognized task worktree under the configured root.",
    ],
    parameters: WorktreeParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: WorktreeInput, signal, _onUpdate, ctx) {
      const mutationService = WorktreeMutationService.of({
        run: <Value>({
          path,
          operation,
        }: {
          readonly path: string;
          readonly operation: Effect.Effect<Value, WorktreeToolError>;
        }) =>
          Effect.tryPromise({
            try: () =>
              withFileMutationQueue(expandHome(path), () =>
                Effect.runPromise(operation),
              ),
            catch: (cause) =>
              new WorktreeMutationError({
                message: `Worktree mutation queue failed: ${cause instanceof Error ? cause.message : String(cause)}`,
              }),
          }),
      });
      const effect = runWorktreeTool({ ...params, cwd: ctx.cwd }).pipe(
        Effect.provide(WorktreeLiveLayer),
        Effect.provide(RepoMapLiveLayer),
        Effect.provideService(WorktreeMutationService, mutationService),
      );
      const result = await runHandler(effect, {
        signal,
        failurePrefix: "Worktree",
      });
      if ("block" in result) return failureText(result.reason);
      return successText(result);
    },
  });
}
