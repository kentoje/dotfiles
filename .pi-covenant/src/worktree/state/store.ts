import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  writeFile,
  rmdir,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import { worktreeFailure } from "../model.js";
import type { WorktreeProgress } from "../model.js";
import { canonicalWorktreePath, worktreeFilesystem } from "../paths/resolve.js";
import { runWorktreeGit } from "../process/run.js";

const WorktreeState = Schema.Struct({
  base: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  path: Schema.String,
  removed: Schema.Boolean,
  setup: Schema.Literals(["none", "completed", "failed"]),
});
export type SavedWorktreeState = typeof WorktreeState.Type;
const stateDirectory = Effect.fn("resolveWorktreeStateDirectory")(
  function* stateDirectory(repository: string) {
    const common = yield* runWorktreeGit(repository, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const path = join(common, "pi-covenant-worktrees");
    if (
      (yield* worktreeFilesystem(() => canonicalWorktreePath(path))) !== path
    ) {
      return yield* worktreeFailure(
        "UNSAFE_PATH",
        "Worktree state directory must not redirect through symlinks."
      );
    }
    return path;
  }
);
const stateFile = (directory: string, path: string) =>
  join(directory, `${createHash("sha256").update(path).digest("hex")}.json`);
/** Private state records comparison basis and removal identity; it never grants deletion authority. */
export const readSavedWorktreeState = Effect.fn("readSavedWorktreeState")(
  function* readSavedWorktreeState(repository: string, path: string) {
    const directory = yield* stateDirectory(repository);
    const text = yield* worktreeFilesystem(() =>
      readFile(stateFile(directory, path), "utf-8").catch((error) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      })
    );
    if (text === null) {
      return null;
    }
    return yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(WorktreeState)
    )(text).pipe(
      Effect.mapError(() =>
        worktreeFailure("STATE_UNKNOWN", "Worktree state record is malformed.")
      )
    );
  }
);
/** Atomic state replacement preserves prior state if the write fails. */
export const saveWorktreeState = Effect.fn("saveWorktreeState")(
  function* saveWorktreeState(repository: string, state: SavedWorktreeState) {
    const directory = yield* stateDirectory(repository);
    yield* worktreeFilesystem(async () => {
      await mkdir(directory, { recursive: true });
      const target = stateFile(directory, state.path);
      const temp = `${target}.${randomUUID()}`;
      try {
        await writeFile(temp, JSON.stringify(state), {
          flag: "wx",
          mode: 0o600,
        });
        await rename(temp, target);
      } finally {
        await unlink(temp).catch((error) => {
          if (error.code !== "ENOENT") {
            throw error;
          }
        });
      }
    });
  }
);
/** A shared Git-directory lock coordinates mutating calls across module instances and processes. */
export const acquireWorktreeLock = Effect.fn("acquireWorktreeLock")(
  function* acquireWorktreeLock(
    repository: string,
    progress: WorktreeProgress
  ) {
    const directory = yield* stateDirectory(repository);
    const lock = `${directory}.lock`;
    return yield* Effect.acquireRelease(
      Effect.tryPromise({
        catch: () =>
          worktreeFailure(
            "RESOURCE_BUSY",
            "Repository worktree mutation is locked; inspect stale locks before retrying."
          ),
        try: () => mkdir(lock),
      }),
      () =>
        worktreeFilesystem(() => rmdir(lock)).pipe(
          Effect.catch(() =>
            Effect.sync(() => {
              progress.cleanupFailed = true;
              progress.warnings.push(
                "Owned mutation lock could not be released; inspect it before retrying."
              );
            })
          )
        )
    );
  }
);
