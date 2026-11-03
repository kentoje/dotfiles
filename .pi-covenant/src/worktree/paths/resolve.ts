import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { Effect } from "effect";

import { worktreeFailure } from "../model.js";
import type { WorktreeHost } from "../model.js";

/** Resolve even an absent destination through existing ancestors, detecting symlink escapes. */
export async function canonicalWorktreePath(path: string): Promise<string> {
  try {
    return await fs.realpath(path);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
    const parent = dirname(path);
    if (parent === path) {
      throw error;
    }
    return join(await canonicalWorktreePath(parent), relative(parent, path));
  }
}
export function isWithinWorktreeRoot(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel !== "" &&
    rel !== ".." &&
    !rel.startsWith(`..${sep}`) &&
    !isAbsolute(rel)
  );
}
export const worktreeFilesystem = <T>(operation: () => Promise<T>) =>
  Effect.tryPromise({
    catch: () =>
      worktreeFailure(
        "FILESYSTEM_FAILED",
        "Worktree filesystem operation failed."
      ),
    try: operation,
  });
export const resolveWorktreeRoot = Effect.fn("resolveWorktreeRoot")(
  function* resolveWorktreeRoot(host: WorktreeHost) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(host.repositoryId)) {
      return yield* worktreeFailure(
        "CONTEXT_UNAVAILABLE",
        "Repository namespace must be a safe configured identifier."
      );
    }
    const configured = resolve(
      host.root ??
        process.env.PI_WORKTREE_ROOT ??
        join(homedir(), ".pi/worktrees")
    );
    const root = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(configured)
    );
    const namespace = join(root, host.repositoryId);
    const actual = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(namespace)
    );
    if (!isWithinWorktreeRoot(root, actual)) {
      return yield* worktreeFailure(
        "UNSAFE_PATH",
        "Repository namespace escapes the managed root."
      );
    }
    return actual;
  }
);
