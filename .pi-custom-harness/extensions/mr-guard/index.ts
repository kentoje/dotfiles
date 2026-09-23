import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { GitLiveLayer } from "../../lib/git/live";
import { GitLabLiveLayer } from "../../lib/gitlab/live";
import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import {
  guardMergeRequestCreation,
  isMergeRequestCreationCommand,
} from "./core";
import {
  livePrepareMergeRequestCreationRuntime,
  type PrepareMergeRequestCreationResult,
  prepareMergeRequestCreation,
} from "./runtime";

/** Registers the structural safeguards that prevent duplicate or unprepared merge requests. */
export default function registerMergeRequestGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, context) => {
    if (!isToolCallEventType("bash", event)) {
      return;
    }

    let allowExistingMergeRequest = false;
    if (isMergeRequestCreationCommand(event.input.command)) {
      let preparation: PrepareMergeRequestCreationResult;
      try {
        preparation = await prepareMergeRequestCreation(
          { command: event.input.command, cwd: context.cwd },
          livePrepareMergeRequestCreationRuntime,
        );
      } catch (cause) {
        return {
          block: true,
          reason: `MR creation preflight failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        };
      }
      if (!preparation.titleValid) {
        return {
          block: true,
          reason: `Merge request title must match <type>(<scope>): <summary> [TICKET-123]. Use --title ${JSON.stringify(preparation.expectedTitle)}.`,
        };
      }
      if (preparation.preflight.action === "ask_user") {
        const confirmed = await context.ui.confirm(
          "Existing merge request found",
          `${preparation.preflight.reason}\n${JSON.stringify(preparation.preflight, null, 2)}\nCreate another merge request anyway?`,
          { signal: context.signal },
        );
        allowExistingMergeRequest = confirmed;
        if (!confirmed) {
          return {
            block: true,
            reason:
              "Merge request creation cancelled after duplicate preflight.",
          };
        }
      }
    }

    const decision = await runHandler(
      guardMergeRequestCreation({
        command: event.input.command,
        cwd: context.cwd,
        allowExistingMergeRequest,
      }).pipe(
        Effect.provide(RepoMapLiveLayer),
        Effect.provide(GitLabLiveLayer),
        Effect.provide(GitLiveLayer),
      ),
      { signal: context.signal },
    );

    if ("block" in decision) {
      return decision;
    }

    if (decision.kind === "block") {
      return { block: true, reason: decision.reason };
    }
  });
}
