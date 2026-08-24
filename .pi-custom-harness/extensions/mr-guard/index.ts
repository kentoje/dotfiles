import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { GitLiveLayer } from "../../lib/git/live";
import { GitLabLiveLayer } from "../../lib/gitlab/live";
import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { guardMergeRequestCreation } from "./core";

/** Registers the structural safeguards that prevent duplicate or unprepared merge requests. */
export default function registerMergeRequestGuard(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, context) => {
    if (!isToolCallEventType("bash", event)) {
      return;
    }

    const decision = await runHandler(
      guardMergeRequestCreation({
        command: event.input.command,
        cwd: context.cwd,
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
