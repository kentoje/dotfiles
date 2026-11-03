import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { Effect } from "effect";

import { worktreeFailure } from "../model.js";
import type { WorktreeHost, WorktreeRecord } from "../model.js";
import {
  canonicalWorktreePath,
  isWithinWorktreeRoot,
  resolveWorktreeRoot,
  worktreeFilesystem,
} from "../paths/resolve.js";
import { readWorktreeRegistry } from "../registration/read.js";
import type { RegisteredWorktree } from "../registration/read.js";
import { readSavedWorktreeState } from "../state/store.js";

interface WorktreeCheck {
  name: string;
  state: "ready" | "missing" | "unknown";
  reason: string;
}
/** Inspect only explicitly declared setup artifacts; no product command runs here. */
export const inspectWorktreeRecord = Effect.fn("inspectWorktreeRecord")(
  function* inspectWorktreeRecord(
    host: WorktreeHost,
    record: RegisteredWorktree
  ) {
    const checks: WorktreeCheck[] = [];
    for (const artifact of host.requiredArtifacts) {
      const path = resolve(record.path, artifact);
      if (isAbsolute(artifact) || !isWithinWorktreeRoot(record.path, path)) {
        return yield* worktreeFailure(
          "UNSAFE_PATH",
          "Setup artifact must be relative to the requested worktree."
        );
      }
      const canonical = yield* worktreeFilesystem(() =>
        canonicalWorktreePath(path)
      );
      if (!isWithinWorktreeRoot(record.path, canonical)) {
        return yield* worktreeFailure(
          "UNSAFE_PATH",
          "Setup artifact escapes the requested worktree."
        );
      }
      const exists = yield* worktreeFilesystem(() =>
        access(path).then(
          () => true,
          (error) => {
            if (error.code === "ENOENT") {
              return false;
            }
            throw error;
          }
        )
      );
      checks.push({
        name: artifact,
        reason: exists ? "Setup artifact exists." : "Missing setup artifact.",
        state: exists ? "ready" : "missing",
      });
    }
    const saved = yield* readSavedWorktreeState(
      host.repositoryPath,
      record.path
    );
    const setupState =
      saved && !saved.removed && saved.branch === record.branch
        ? saved.setup
        : null;
    let readiness: WorktreeRecord["readiness"] = "unavailable";
    if (setupState === "failed") {
      readiness = "setup_failed";
    } else if (
      checks.every((check) => check.state === "ready") &&
      !record.prunable
    ) {
      if (checks.length || setupState === "completed") {
        readiness = "ready";
      } else if (host.setup.kind === "none") {
        readiness = "not_configured";
      }
    }
    const worktree: WorktreeRecord = {
      branch: record.branch,
      head_sha: record.head_sha,
      path: record.path,
      readiness,
      setup_completed: readiness === "ready",
    };
    return { checks, worktree };
  }
);

/** Require an exact Git registration under the managed namespace, not an arbitrary directory. */
export const requireManagedWorktree = Effect.fn("requireManagedWorktree")(
  function* requireManagedWorktree(host: WorktreeHost, requested: string) {
    const root = yield* resolveWorktreeRoot(host);
    const path = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(resolve(host.sessionCwd, requested))
    );
    if (!isWithinWorktreeRoot(root, path)) {
      return yield* worktreeFailure(
        "UNMANAGED_PATH",
        "Requested path is outside the configured task namespace."
      );
    }
    const registry = yield* readWorktreeRegistry(host.repositoryPath);
    const record = registry.find((entry) => entry.path === path);
    if (!record) {
      return yield* worktreeFailure(
        "NOT_FOUND",
        "Requested path is not a registered task worktree."
      );
    }
    if (record.primary) {
      return yield* worktreeFailure(
        "UNMANAGED_PATH",
        "Primary checkout is not a managed task worktree."
      );
    }
    return { record, root };
  }
);
