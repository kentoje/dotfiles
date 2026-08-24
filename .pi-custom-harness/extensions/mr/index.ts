import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import {
  MergeRequestClock,
  type MergeRequestPipelineSettled,
  type MergeRequestStatus,
  MergeRequestTimer,
  type MergeRequestUpdateResult,
} from "../../lib/mr/core";
import {
  MergeRequestCommitLiveLayer,
  MergeRequestLiveLayer,
} from "../../lib/mr/live";
import { runTool } from "../../lib/pi-bridge/core";
import {
  makePipelineRedSettlementOutcome,
  SETTLEMENT_OUTCOME_CHANNEL,
} from "../notify-on-settle/core";
import { type MergeRequestActionResult, runMergeRequestAction } from "./core";
import { type MergeRequestInput, MergeRequestParams } from "./schema";

const failureDetails = (
  request: MergeRequestInput,
): MergeRequestActionResult => {
  switch (request.action) {
    case "status": {
      const status: MergeRequestStatus = {
        iid: 0,
        title: "",
        draft: false,
        discussionsOk: false,
        pipelineState: "unknown",
        unresolvedCount: 0,
        boundTicket: undefined,
      };
      return { action: "status", status };
    }
    case "threads":
      return { action: "threads", threads: [] };
    case "reply": {
      const threadId = request.threadId ?? "";
      return {
        action: "reply",
        reply: {
          threadId,
          resolved: request.resolve ?? false,
        },
      };
    }
    case "update": {
      const update: MergeRequestUpdateResult = {
        iid: 0,
        title: "",
        description: "",
      };
      return { action: "update", update };
    }
    case "watch": {
      const settled: MergeRequestPipelineSettled = { iid: 0, state: "unknown" };
      return { action: "watch", settled };
    }
    default: {
      const exhaustive: never = request.action;
      return exhaustive;
    }
  }
};
/** Registers the merge request tool and owns watch cancellation at the Pi session boundary. */
export default function registerMergeRequestTool(pi: ExtensionAPI): void {
  let sessionActive = true;
  const watchControllers = new Set<AbortController>();

  pi.on("session_shutdown", () => {
    sessionActive = false;
    for (const controller of watchControllers) controller.abort();
    watchControllers.clear();
  });

  pi.registerTool({
    name: "mr",
    label: "Merge request",
    description:
      "Inspect and update the existing merge request; reply to threads or watch its pipeline. There is no open action.",
    promptSnippet:
      "Inspect MR status, threads, and reply to review discussions",
    parameters: MergeRequestParams,
    async execute(
      _toolCallId,
      request: MergeRequestInput,
      signal,
      _onUpdate,
      context,
    ) {
      const actionEffect = runMergeRequestAction({
        cwd: context.cwd,
        request,
      }).pipe(
        Effect.provide(MergeRequestLiveLayer),
        Effect.provide(MergeRequestCommitLiveLayer),
        Effect.provideService(MergeRequestClock, {
          currentTimeMillis: Effect.clockWith(
            (clock) => clock.currentTimeMillis,
          ),
        }),
        Effect.provideService(MergeRequestTimer, {
          sleep: (milliseconds) => Effect.sleep(milliseconds),
        }),
      );
      const toolEffect = actionEffect.pipe(
        Effect.map((result) => ({
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: result,
        })),
      );

      if (request.action !== "watch") {
        return runTool(toolEffect, {
          signal,
          failurePrefix: "MR tool",
          failureResult: (reason) => ({
            content: [{ type: "text" as const, text: reason }],
            details: failureDetails(request),
          }),
        });
      }

      const controller = new AbortController();
      watchControllers.add(controller);
      if (signal)
        signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      const watchToken = controller;
      void runTool(toolEffect, {
        signal: controller.signal,
        failurePrefix: "MR tool",
        failureResult: (reason) => ({
          content: [{ type: "text" as const, text: reason }],
          details: failureDetails(request),
        }),
      }).then((result) => {
        watchControllers.delete(watchToken);
        if (
          !sessionActive ||
          watchToken.signal.aborted ||
          !("details" in result)
        )
          return;
        if (
          result.details.action === "watch" &&
          result.details.settled.state === "failed"
        ) {
          pi.events.emit(
            SETTLEMENT_OUTCOME_CHANNEL,
            makePipelineRedSettlementOutcome({
              sessionId: context.sessionManager.getSessionId(),
              pipelineIid: result.details.settled.iid,
            }),
          );
        }
        pi.sendMessage(
          {
            customType: "mr-pipeline-settled",
            content: result.content,
            display: true,
            details: result.details,
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
      });

      return {
        content: [
          {
            type: "text" as const,
            text: "Watching the merge request pipeline; I will follow up when it settles.",
          },
        ],
        details: failureDetails(request),
      };
    },
  });
}
