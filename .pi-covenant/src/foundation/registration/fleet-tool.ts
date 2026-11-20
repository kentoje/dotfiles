import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { makeFleetModule } from "../../fleet/module-port.js";
import type {
  FleetRepository,
  FleetCheckoutStatus,
} from "../../fleet/module-port.js";
import { makeMrModule } from "../../mr/module-port.js";
import { resolveProjectContext } from "../../repository-context/module-port.js";
import { loadFleetInventory } from "../fleet/inventory.js";
import { readFleetStatus } from "../fleet/status.js";
import { readFleetVersions } from "../fleet/versions.js";
import { piBoundaryFailure, piToolResult } from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { renderPiDetails } from "../invocation/render.js";
import { createPiMrHost } from "../mr/host.js";

function isFleetMr(
  value: unknown
): value is { iid: number; url: string; head_sha: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "iid" in value &&
    typeof value.iid === "number" &&
    "url" in value &&
    typeof value.url === "string" &&
    "head_sha" in value &&
    typeof value.head_sha === "string"
  );
}
async function readFleetMrs(
  options: PiHarnessOptions,
  repo: FleetRepository,
  branch: string,
  signal: AbortSignal
): Promise<FleetCheckoutStatus["merge_requests"]> {
  if (!options.gitlab) {
    return null;
  }
  const checkout = await resolveProjectContext(
    {},
    { gitlab: { allowedHosts: [options.gitlab.host] }, sessionCwd: repo.path }
  );
  const target = checkout.data?.gitlab_target;
  if (!target) {
    if (checkout.error?.code === "CONTEXT_UNAVAILABLE") {
      return null;
    }
    throw new Error("REMOTE_LOOKUP_FAILED");
  }
  const mr = makeMrModule(createPiMrHost(options, repo.path));
  const result = await Effect.runPromise(
    mr.status(
      { repository: `https://${target.host}/${target.project_path}` },
      { signal },
      { branch }
    )
  );
  if (result.status === "ok") {
    if (result.data?.selection === "absent") {
      return [];
    }
    const row = result.data?.merge_request;
    if (isFleetMr(row)) {
      return [{ head_sha: row.head_sha, iid: row.iid, url: row.url }];
    }
  }
  const details = result.error?.details;
  if (
    result.error?.code === "AMBIGUOUS_MR" &&
    details &&
    "candidates" in details &&
    Array.isArray(details.candidates) &&
    details.candidates.every(isFleetMr)
  ) {
    return details.candidates.map(({ iid, url, head_sha }) => ({
      head_sha,
      iid,
      url,
    }));
  }
  throw new Error("REMOTE_LOOKUP_FAILED");
}
const parameters = Type.Object(
  {
    action: Type.Union([Type.Literal("status"), Type.Literal("versions")]),
    package: Type.Optional(Type.String()),
    repositories: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false }
);

export function createFleetTool(options: PiHarnessOptions) {
  return {
    description:
      "Read status or exact declared package versions across configured repositories.",
    async execute(_id, input: unknown, signal) {
      try {
        if (!Value.Check(parameters, input)) {
          throw new Error("FLEET_INPUT: expected status or versions.");
        }
        const repositories = await loadFleetInventory(options.fleetFile);
        const fleet = makeFleetModule({
          repositories,
          status: (repo, active) =>
            readFleetStatus(repo, active, (branch, bounded) =>
              readFleetMrs(options, repo, branch, bounded)
            ),
          versions: readFleetVersions,
        });
        const { action, ...args } = input;
        const result = await fleet[action](args, signal);
        return piToolResult(
          result,
          result.status !== "ok",
          renderPiDetails(`Fleet ${action}: ${result.status}`, result)
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "Fleet",
    name: "fleet",
    parameters,
    promptSnippet:
      "Read configured repository status or compare declared package specifications.",
  } satisfies ToolDefinition<typeof parameters, unknown>;
}
