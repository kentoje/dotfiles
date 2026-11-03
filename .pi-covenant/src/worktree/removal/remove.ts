import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import { Effect } from "effect";

import { requireManagedWorktree } from "../inspection/inspect.js";
import { worktreeFailure } from "../model.js";
import type { WorktreeHost, WorktreeProgress } from "../model.js";
import {
  resolveWorktreeRoot,
  canonicalWorktreePath,
  isWithinWorktreeRoot,
  worktreeFilesystem,
} from "../paths/resolve.js";
import { runWorktreeGit } from "../process/run.js";
import { readWorktreeRegistry } from "../registration/read.js";
import { readSavedWorktreeState, saveWorktreeState } from "../state/store.js";

/** Removal refuses unique work and uses only non-forced Git worktree removal. */
export const removeManagedWorktree = Effect.fn("removeManagedWorktree")(
  function* removeManagedWorktree(
    host: WorktreeHost,
    requested: string,
    progress: WorktreeProgress
  ) {
    const requestedPath = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(resolve(host.sessionCwd, requested))
    );
    const root = yield* resolveWorktreeRoot(host);
    if (!isWithinWorktreeRoot(root, requestedPath)) {
      return yield* worktreeFailure(
        "UNSAFE_PATH",
        "Requested path is outside the managed namespace."
      );
    }
    const saved = yield* readSavedWorktreeState(
      host.repositoryPath,
      requestedPath
    );
    const registered = (yield* readWorktreeRegistry(host.repositoryPath)).some(
      (record) => record.path === requestedPath
    );
    if (!registered && saved?.removed && saved.path === requestedPath) {
      const present = yield* worktreeFilesystem(() =>
        lstat(requestedPath).then(
          () => true,
          (error) => {
            if (error.code === "ENOENT") {
              return false;
            }
            throw error;
          }
        )
      );
      if (present) {
        return yield* worktreeFailure(
          "UNSAFE_PATH",
          "An unrelated directory has replaced the removed worktree."
        );
      }
      return { branch_deleted: false, path: requestedPath, removed: false };
    }
    const { record } = yield* requireManagedWorktree(host, requested);
    const session = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(resolve(host.sessionCwd))
    );
    if (session === record.path || isWithinWorktreeRoot(record.path, session)) {
      return yield* worktreeFailure(
        "CURRENT_WORKTREE",
        "Cannot remove the active session checkout."
      );
    }
    if (record.locked) {
      return yield* worktreeFailure(
        "LOCKED_WORKTREE",
        "Git has locked this checkout."
      );
    }
    const dirty = yield* runWorktreeGit(record.path, [
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
      "--ignored=matching",
    ]);
    if (dirty) {
      return yield* worktreeFailure(
        "DIRTY_WORKTREE",
        "Checkout has tracked, untracked or ignored files that would be lost."
      );
    }
    const upstream = record.branch
      ? yield* runWorktreeGit(record.path, [
          "for-each-ref",
          "--format=%(upstream)",
          `refs/heads/${record.branch}`,
        ])
      : "";
    const base = upstream || host.defaultBase || saved?.base;
    if (!base || base.startsWith("-")) {
      return yield* worktreeFailure(
        "STATE_UNKNOWN",
        "No comparison ref is available for safe removal."
      );
    }
    const count = yield* runWorktreeGit(record.path, [
      "rev-list",
      "--count",
      `${base}..HEAD`,
    ]).pipe(
      Effect.mapError(() =>
        worktreeFailure("STATE_UNKNOWN", "Cannot resolve the comparison ref.")
      )
    );
    if (!/^\d+$/u.test(count)) {
      return yield* worktreeFailure(
        "STATE_UNKNOWN",
        "Git returned an unknown ahead state."
      );
    }
    if (Number(count) > 0) {
      return yield* worktreeFailure(
        "AHEAD_COMMITS",
        "Checkout has commits ahead of its comparison ref."
      );
    }
    progress.effects.push({
      outcome: "unknown",
      phase: "remove",
      reference: record.branch,
      target: record.path,
    });
    const observeRemoval = Effect.fn("observeWorktreeRemoval")(
      function* observeRemoval() {
        const stillRegistered = (yield* readWorktreeRegistry(
          host.repositoryPath
        )).some((entry) => entry.path === record.path);
        const exists = yield* worktreeFilesystem(() =>
          lstat(record.path).then(
            () => true,
            (error) => {
              if (error.code === "ENOENT") {
                return false;
              }
              throw error;
            }
          )
        );
        if (stillRegistered && exists) {
          progress.effects = [];
          return;
        }
        if (!stillRegistered && !exists) {
          progress.removal = {
            branch_deleted: false,
            path: record.path,
            removed: true,
          };
          progress.effects = [
            {
              outcome: "committed",
              phase: "remove",
              reference: record.branch,
              target: record.path,
            },
          ];
          yield* saveWorktreeState(host.repositoryPath, {
            base,
            branch: record.branch,
            path: record.path,
            removed: true,
            setup: saved?.setup ?? "none",
          });
        }
      }
    );
    yield* runWorktreeGit(host.repositoryPath, [
      "worktree",
      "remove",
      record.path,
    ]).pipe(
      Effect.mapError(() =>
        worktreeFailure(
          "REMOVE_FAILED",
          "Git refused non-forced worktree removal."
        )
      ),
      Effect.onExit(() =>
        observeRemoval().pipe(
          Effect.catch(() =>
            Effect.sync(() => {
              progress.warnings.push(
                "Removal readback or state recording failed; inspect the reported target before retrying."
              );
            })
          )
        )
      )
    );
    if (!progress.removal) {
      return yield* worktreeFailure(
        "STATE_UNKNOWN",
        "Removal outcome could not be confirmed."
      );
    }
    return { branch_deleted: false, path: record.path, removed: true };
  }
);
