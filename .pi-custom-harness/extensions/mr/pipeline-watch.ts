import { realpath } from "node:fs/promises";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import {
  MergeRequestClock,
  type MergeRequestPipelineSettled,
  MergeRequestTimer,
} from "../../lib/mr/core";
import { MergeRequestLiveLayer } from "../../lib/mr/live";
import { type PiHandlerFailure, runHandler } from "../../lib/pi-bridge/core";
import { watchMergeRequestPipeline } from "./core";

/** Outcome reported by the user-activated pipeline watch runtime. */
export type HarnessPipelineWatchResult =
  | PiHandlerFailure
  | {
      readonly action: "watch";
      readonly settled: MergeRequestPipelineSettled;
    };

/** Runtime seam for polling one selected worktree's pipeline. */
export interface HarnessPipelineWatchRuntime {
  readonly watch: (input: {
    readonly cwd: string;
    readonly intervalMs: number;
    readonly signal: AbortSignal;
  }) => Promise<HarnessPipelineWatchResult>;
}

const liveHarnessPipelineWatchRuntime: HarnessPipelineWatchRuntime = {
  watch: ({ cwd, intervalMs, signal }) =>
    runHandler(
      watchMergeRequestPipeline({ cwd, intervalMs }).pipe(
        Effect.provide(MergeRequestLiveLayer),
        Effect.provideService(MergeRequestClock, {
          currentTimeMillis: Effect.clockWith(
            (clock) => clock.currentTimeMillis,
          ),
        }),
        Effect.provideService(MergeRequestTimer, {
          sleep: (milliseconds) => Effect.sleep(milliseconds),
        }),
      ),
      { signal, failurePrefix: "Pipeline watch" },
    ),
};

/** Command context needed to resolve the selected worktree and notify the user. */
export interface HarnessPipelineWatchCommandContext {
  readonly cwd: string;
  readonly ui: Pick<ExtensionCommandContext["ui"], "notify">;
}

/** Minimal Pi interface needed to register the explicit pipeline watch command. */
export interface HarnessPipelineWatchCommandApi {
  readonly on: (event: "session_shutdown", handler: () => void) => void;
  readonly registerCommand: (
    name: string,
    options: {
      readonly description: string;
      readonly handler: (
        args: string,
        context: HarnessPipelineWatchCommandContext,
      ) => Promise<void>;
    },
  ) => void;
}

/** Parsed worktree selection and polling interval for `/harness-watch-pipeline`. */
export interface HarnessPipelineWatchArguments {
  readonly worktree: string | undefined;
  readonly intervalMs: number;
}

/** Parses `/harness-watch-pipeline [worktree] [poll-seconds]`. */
export const parseHarnessPipelineWatchArguments = (
  args: string,
): HarnessPipelineWatchArguments => {
  const values = args.trim().split(/\s+/u).filter(Boolean);
  const worktree = values[0]?.startsWith("/") ? values[0] : undefined;
  const secondsText = worktree === undefined ? values[0] : values[1];
  const seconds = Number.parseInt(secondsText ?? "", 10);
  return {
    worktree,
    intervalMs:
      Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 30_000,
  };
};

/** Registers user-activated `/harness-watch-pipeline` monitoring without model follow-up turns. */
export const registerHarnessPipelineWatchCommand = (
  pi: HarnessPipelineWatchCommandApi,
  runtime: HarnessPipelineWatchRuntime = liveHarnessPipelineWatchRuntime,
): void => {
  const watchControllers = new Set<AbortController>();

  pi.on("session_shutdown", () => {
    for (const controller of watchControllers) controller.abort();
    watchControllers.clear();
  });

  pi.registerCommand("harness-watch-pipeline", {
    description:
      "Watch a pipeline on explicit user request: /harness-watch-pipeline [worktree] [poll-seconds].",
    handler: async (args, context) => {
      const parsed = parseHarnessPipelineWatchArguments(args);
      const requestedWorktree = parsed.worktree ?? context.cwd;
      let cwd: string;
      try {
        cwd = await realpath(requestedWorktree);
      } catch {
        context.ui.notify(
          `Pipeline watch worktree does not exist: ${requestedWorktree}`,
          "error",
        );
        return;
      }
      const controller = new AbortController();
      watchControllers.add(controller);
      context.ui.notify("Pipeline watch started.", "info");

      void runtime
        .watch({
          cwd,
          intervalMs: parsed.intervalMs,
          signal: controller.signal,
        })
        .then((result) => {
          watchControllers.delete(controller);
          if (controller.signal.aborted) return;
          if ("block" in result) {
            context.ui.notify(result.reason, "error");
            return;
          }
          const { iid, state } = result.settled;
          context.ui.notify(
            `Pipeline for merge request !${iid} settled: ${state}.`,
            state === "failed" ? "error" : "info",
          );
        })
        .catch((error: unknown) => {
          watchControllers.delete(controller);
          if (controller.signal.aborted) return;
          context.ui.notify(
            `Pipeline watch failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        });
    },
  });
};
