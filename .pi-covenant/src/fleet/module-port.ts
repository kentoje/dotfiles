import { Type } from "typebox";
import { Value } from "typebox/value";

export interface FleetRepository {
  id: string;
  path: string;
  comparisonRef?: string;
  manifests?: readonly string[];
}
interface FleetError {
  code: string;
  message: string;
}
export interface FleetCheckoutStatus {
  branch: string | null;
  head_sha: string;
  dirty_tracked: boolean;
  untracked_count: number;
  comparison_ref: string | null;
  ahead: number | null;
  behind: number | null;
  comparison_unavailable_reason: string | null;
  observed_at: string;
  merge_requests:
    | readonly { iid: number; url: string; head_sha: string }[]
    | null;
}
interface FleetVersionStatus {
  missing: boolean;
  manifests_read: readonly string[];
  declarations: readonly { manifest: string; section: string; spec: string }[];
}
interface FleetObservation<T> {
  data: T | null;
  errors: readonly FleetError[];
}
interface FleetHost {
  repositories: readonly FleetRepository[];
  status: (
    repo: FleetRepository,
    signal: AbortSignal
  ) => Promise<FleetObservation<FleetCheckoutStatus>>;
  versions: (
    repo: FleetRepository,
    pkg: string,
    signal: AbortSignal
  ) => Promise<FleetObservation<FleetVersionStatus>>;
}
const ids = Type.Optional(
  Type.Array(Type.String({ maxLength: 150, minLength: 1 }), { maxItems: 100 })
);
const statusInput = Type.Object(
  { repositories: ids },
  { additionalProperties: false }
);
const versionsInput = Type.Object(
  {
    package: Type.String({
      maxLength: 214,
      minLength: 1,
      pattern: "^[^\\s]+$",
    }),
    repositories: ids,
  },
  { additionalProperties: false }
);

function fleetResult<T>(
  status: "ok" | "partial" | "blocked" | "error" | "cancelled",
  data: T | null,
  code?: string,
  message?: string
) {
  return {
    completed_effects: [],
    context: {},
    data,
    error: code
      ? { code, message: message ?? code, phase: "fleet", retryable: false }
      : null,
    status,
    warnings: [],
  };
}
async function collectFleet<T, M extends object>(
  inventory: readonly FleetRepository[],
  requested: readonly string[] | undefined,
  read: (
    repo: FleetRepository,
    signal: AbortSignal
  ) => Promise<FleetObservation<T>>,
  meta: M,
  outer?: AbortSignal
) {
  const available = new Map(inventory.map((repo) => [repo.id, repo]));
  const selection = requested ? [...new Set(requested)] : [...available.keys()];
  if (selection.some((id) => !available.has(id))) {
    return fleetResult(
      "blocked",
      null,
      "UNKNOWN_REPOSITORY",
      `Unknown fleet IDs: ${selection.filter((id) => !available.has(id)).join(", ")}`
    );
  }
  const signal = AbortSignal.any([
    AbortSignal.timeout(30_000),
    ...(outer ? [outer] : []),
  ]);
  const results = [];
  for (const id of selection) {
    const repo = available.get(id);
    if (!repo || signal.aborted) {
      break;
    }
    let result: FleetObservation<T>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- Bound host effects to one repository at a time.
      result = await read(repo, signal);
    } catch {
      result = {
        data: null,
        errors: [
          {
            code: "LOCAL_LOOKUP_FAILED",
            message: "The selected checkout could not be read.",
          },
        ],
      };
    }
    const availableStatus = result.errors.length ? "partial" : "ok";
    const status = result.data === null ? "error" : availableStatus;
    results.push({ repository: id, status, ...result });
  }
  const succeeded = results.filter((row) => row.data !== null).length;
  const data = {
    ...meta,
    failed_count: results.length - succeeded,
    results,
    selected_count: selection.length,
    succeeded_count: succeeded,
  };
  if (signal.aborted) {
    return fleetResult(
      "cancelled",
      data,
      "FLEET_STOPPED",
      "Fleet stopped before all repositories could be read."
    );
  }
  if (results.every((row) => row.status === "ok")) {
    return fleetResult("ok", data);
  }
  return succeeded > 0
    ? fleetResult(
        "partial",
        data,
        "FLEET_PARTIAL",
        "One or more fleet observations are unavailable."
      )
    : fleetResult(
        "error",
        data,
        "FLEET_FAILED",
        "No selected repository could be read."
      );
}

/** Read-only Fleet operations over an explicit host inventory. */
export function makeFleetModule(host: FleetHost) {
  return {
    status: (input: unknown, signal?: AbortSignal) =>
      Value.Check(statusInput, input)
        ? collectFleet(
            host.repositories,
            input.repositories,
            host.status,
            {},
            signal
          )
        : Promise.resolve(fleetResult("blocked", null, "INVALID_INPUT")),
    versions: (input: unknown, signal?: AbortSignal) =>
      Value.Check(versionsInput, input)
        ? collectFleet(
            host.repositories,
            input.repositories,
            (repo, active) => host.versions(repo, input.package, active),
            { package: input.package },
            signal
          )
        : Promise.resolve(fleetResult("blocked", null, "INVALID_INPUT")),
  };
}
