// Pi entrypoint intentionally owns only schema validation, queueing, and result mapping.
import { homedir } from "node:os";
import {
  type ExtensionAPI,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { preflightTaskCreation } from "../../lib/task-preflight/core";
import { TaskPreflightLiveLayer } from "../../lib/task-preflight/live";
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
/** Registers worktree actions plus duplicate preflight for task resources. */
export default function registerWorktreeTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "worktree",
    label: "Worktree",
    description:
      "Create, verify by task handle, list, or safely remove task worktrees; new accepts an optional contextual branch.",
    promptSnippet: "Create and verify repository task worktrees.",
    promptGuidelines: [
      "Use a slash-free task handle for the worktree path and pass branch as <type>/<context>/<ticket> when the repository convention requires it.",
      "Use worktree verify with the same task handle when a checkout may be missing repository setup.",
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
      if (params.action === "new") {
        const preflight = await runHandler(
          preflightTaskCreation({
            cwd: ctx.cwd,
            query: params.branch ?? params.task,
            resource: "worktree",
          }).pipe(Effect.provide(TaskPreflightLiveLayer)),
          { signal, failurePrefix: "Worktree preflight" },
        );
        if ("block" in preflight) return failureText(preflight.reason);
        if (preflight.action === "ask_user") {
          const confirmed = await ctx.ui.confirm(
            "Existing task resources found",
            `${preflight.reason}\n${JSON.stringify(preflight, null, 2)}\nCreate the worktree anyway?`,
            { signal },
          );
          if (!confirmed) {
            return failureText(
              "Worktree creation cancelled after duplicate preflight.",
            );
          }
        }
      }
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
