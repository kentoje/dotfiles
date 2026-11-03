import { Effect } from "effect";

import { inspectWorktreeRecord } from "../inspection/inspect.js";
import type {
  WorktreeHost,
  WorktreeProgress,
  WorktreeRecord,
} from "../model.js";
import { isWithinWorktreeRoot, resolveWorktreeRoot } from "../paths/resolve.js";
import { readWorktreeRegistry } from "../registration/read.js";

/** List only registered task checkouts within the selected managed namespace. */
export const listManagedWorktrees = Effect.fn("listManagedWorktrees")(
  function* listManagedWorktrees(
    host: WorktreeHost,
    progress: WorktreeProgress
  ) {
    const root = yield* resolveWorktreeRoot(host);
    const records = (yield* readWorktreeRegistry(host.repositoryPath))
      .filter(
        (record) => !record.primary && isWithinWorktreeRoot(root, record.path)
      )
      .toSorted((a, b) => a.path.localeCompare(b.path));
    const worktrees: WorktreeRecord[] = [];
    for (const record of records) {
      worktrees.push((yield* inspectWorktreeRecord(host, record)).worktree);
      if (record.locked || record.prunable) {
        progress.warnings.push(
          `Worktree ${record.path}: ${record.locked ? "locked" : "prunable"}.`
        );
      }
    }
    return { root, worktrees };
  }
);
