import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type {
  FleetCheckoutStatus,
  FleetRepository,
} from "../../fleet/module-port.js";

const git = promisify(execFile);
type FleetMrLookup = (
  branch: string,
  signal: AbortSignal
) => Promise<FleetCheckoutStatus["merge_requests"]>;
async function fleetGit(cwd: string, signal: AbortSignal, ...args: string[]) {
  const { stdout } = await git(
    "git",
    [
      "--no-optional-locks",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.untrackedCache=false",
      ...args,
    ],
    {
      cwd,
      env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_OPTIONAL_LOCKS: "0" },
      maxBuffer: 1_048_576,
      signal,
      timeout: 7000,
    }
  );
  return stdout;
}
async function readFleetComparison(
  repo: FleetRepository,
  branch: string | null,
  signal: AbortSignal
) {
  const upstream = branch
    ? await fleetGit(
        repo.path,
        signal,
        "rev-parse",
        "--symbolic-full-name",
        "@{upstream}"
      ).catch(() => null)
    : null;
  const comparison_ref = repo.comparisonRef ?? upstream?.trim() ?? null;
  const counts = comparison_ref
    ? await fleetGit(
        repo.path,
        signal,
        "rev-list",
        "--left-right",
        "--count",
        `HEAD...${comparison_ref}`,
        "--"
      ).catch(() => null)
    : null;
  const match = /^(?<ahead>\d+)\s+(?<behind>\d+)$/u.exec(
    counts?.trim() ?? ""
  )?.groups;
  const ahead = Number(match?.ahead);
  const behind = Number(match?.behind);
  if (Number.isSafeInteger(ahead) && Number.isSafeInteger(behind)) {
    return {
      ahead,
      behind,
      comparison_ref,
      comparison_unavailable_reason: null,
    };
  }
  return {
    ahead: null,
    behind: null,
    comparison_ref,
    comparison_unavailable_reason: comparison_ref
      ? "Local comparison ref or history unavailable."
      : "No local comparison ref configured or observed.",
  };
}

export async function readFleetStatus(
  repo: FleetRepository,
  signal: AbortSignal,
  lookup?: FleetMrLookup
) {
  const path = await realpath(repo.path);
  const checkout = await fleetGit(path, signal, "rev-parse", "--show-toplevel");
  const root = checkout.trim();
  if ((await realpath(root)) !== path) {
    throw new Error("Fleet inventory requires a checkout root.");
  }
  const [head, branchRef, status] = await Promise.all([
    fleetGit(path, signal, "rev-parse", "--verify", "HEAD^{commit}"),
    fleetGit(path, signal, "symbolic-ref", "--quiet", "--short", "HEAD").catch(
      () => null
    ),
    fleetGit(
      path,
      signal,
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--no-renames"
    ),
  ]);
  const branch = branchRef?.trim() ?? null;
  const entries = status.split("\0").filter(Boolean);
  const local = {
    branch,
    dirty_tracked: entries.some((entry) => !entry.startsWith("?? ")),
    head_sha: head.trim(),
    observed_at: new Date().toISOString(),
    untracked_count: entries.filter((entry) => entry.startsWith("?? ")).length,
    ...(await readFleetComparison(
      {
        id: repo.id,
        path,
        ...(repo.comparisonRef ? { comparisonRef: repo.comparisonRef } : {}),
      },
      branch,
      signal
    )),
  };
  try {
    const merge_requests =
      branch && lookup ? await lookup(branch, signal) : null;
    return { data: { ...local, merge_requests }, errors: [] };
  } catch {
    return {
      data: { ...local, merge_requests: null },
      errors: [
        {
          code: "REMOTE_LOOKUP_FAILED",
          message: "GitLab MR observations are unavailable.",
        },
      ],
    };
  }
}
