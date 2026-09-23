import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import type {
  MergeRequestStatus,
  MergeRequestUpdateResult,
} from "../../lib/mr/core";
import {
  MergeRequestCommitLiveLayer,
  MergeRequestLiveLayer,
} from "../../lib/mr/live";
import { runTool } from "../../lib/pi-bridge/core";
import { type MergeRequestActionResult, runMergeRequestAction } from "./core";
import { registerHarnessPipelineWatchCommand } from "./pipeline-watch";
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
    case "reply":
      return {
        action: "reply",
        reply: {
          threadId: request.threadId ?? "",
          resolved: request.resolve ?? false,
        },
      };
    case "update": {
      const update: MergeRequestUpdateResult = {
        iid: 0,
        title: "",
        description: "",
      };
      return { action: "update", update };
    }
    default: {
      const exhaustive: never = request.action;
      return exhaustive;
    }
  }
};

/** Registers one-shot MR actions and the user-activated pipeline watch command. */
export default function registerMergeRequestTool(pi: ExtensionAPI): void {
  registerHarnessPipelineWatchCommand(pi);

  pi.registerTool({
    name: "mr",
    label: "Merge request",
    description:
      "Inspect and update the existing merge request or reply to threads. There is no open or watch action.",
    promptSnippet:
      "Inspect MR status, threads, and reply to review discussions",
    promptGuidelines: [
      "Use mr for merge request state instead of hand-rolling glab api calls.",
      "After an mr lookup miss, stay on mr; do not fall back to glab api.",
      "Create merge requests with bash mr-guard, not with mr.",
    ],
    parameters: MergeRequestParams,
    async execute(
      _toolCallId,
      request: MergeRequestInput,
      signal,
      _onUpdate,
      context,
    ) {
      const toolEffect = runMergeRequestAction({
        cwd: context.cwd,
        request,
      }).pipe(
        Effect.provide(MergeRequestLiveLayer),
        Effect.provide(MergeRequestCommitLiveLayer),
        Effect.map((result) => ({
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: result,
        })),
      );

      return runTool(toolEffect, {
        signal,
        failurePrefix: "MR tool",
        failureResult: (reason) => ({
          content: [{ type: "text" as const, text: reason }],
          details: failureDetails(request),
        }),
      });
    },
  });
}
