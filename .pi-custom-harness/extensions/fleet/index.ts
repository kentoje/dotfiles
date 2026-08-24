import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { FleetConfirmationService } from "../../lib/fleet/core";
import { FleetLiveLayer } from "../../lib/fleet/live";
import { runHandler } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { runFleetTool } from "./core";
import { type FleetInput, FleetParams } from "./schema";

type FleetTextContent = { type: "text"; text: string };
type FleetToolDetails = unknown;
type FleetSuccessResult = {
  content: Array<FleetTextContent>;
  details: FleetToolDetails;
};
type FleetFailureResult = {
  content: Array<FleetTextContent>;
  details: FleetToolDetails;
  isError: true;
};
const successText = (value: unknown): FleetSuccessResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  details: value,
});

const failureText = (reason: string): FleetFailureResult => ({
  content: [{ type: "text", text: reason }],
  details: {},
  isError: true,
});

/** Registers status, versions, safe sync, install, and orphan-prune fleet actions. */
export default function registerFleetTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "fleet",
    label: "Fleet",
    description: "Inspect and maintain every repository declared by repo-map.",
    promptSnippet:
      "Inspect repository fleet status, versions, sync plans, installs, and portless orphans.",
    promptGuidelines: [
      "Use fleet status for branch, dirty, ahead/behind, and open merge request state.",
      "Use fleet versions with a package name to compare repository pins.",
      "Use fleet sync without hard first; hard sync always displays pending work and asks for confirmation.",
      "Use fleet prune only for portless servers reported as orphaned by the injected service.",
    ],
    parameters: FleetParams,
    executionMode: "sequential",
    async execute(_toolCallId, input: FleetInput, signal, _onUpdate, context) {
      const confirmation = FleetConfirmationService.of({
        confirm: ({ pending }) =>
          Effect.promise(() =>
            context.ui.confirm(
              "Confirm destructive fleet sync",
              `The following pending work will be discarded before aligning repositories to origin/main:\n${JSON.stringify(pending, null, 2)}`,
              { signal },
            ),
          ),
      });
      const effect = runFleetTool({ input, cwd: context.cwd }).pipe(
        Effect.provide(FleetLiveLayer),
        Effect.provide(RepoMapLiveLayer),
        Effect.provideService(FleetConfirmationService, confirmation),
      );
      const result = await runHandler(effect, {
        signal,
        failurePrefix: "Fleet",
      });
      if ("block" in result) return failureText(result.reason);
      return successText(result);
    },
  });
}
