import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect, Layer } from "effect";

import {
  HarnessBacklogFileSystemService,
  HarnessBacklogFilesystemError,
  HarnessBacklogPathError,
} from "./core";

const defaultDocsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../docs",
);

const docsFilePath = (
  docsDirectory: string,
  fileName: "BACKLOG.md" | "TODO.md",
) => join(resolve(docsDirectory), fileName);

const readUtf8 = (targetPath: string, allowMissing: boolean) =>
  Effect.tryPromise({
    try: async () => {
      try {
        return await readFile(targetPath, "utf8");
      } catch (cause) {
        if (
          allowMissing &&
          cause instanceof Error &&
          "code" in cause &&
          cause.code === "ENOENT"
        ) {
          return "";
        }
        throw cause;
      }
    },
    catch: (cause) =>
      new HarnessBacklogFilesystemError({
        message: `Could not read ${targetPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  });

/** Builds a docs-directory filesystem that can write only BACKLOG.md in that directory. */
export const HarnessBacklogLiveLayerForDirectory = (
  docsDirectory: string,
): Layer.Layer<HarnessBacklogFileSystemService> => {
  const backlogFile = docsFilePath(docsDirectory, "BACKLOG.md");
  const roadmapFile = docsFilePath(docsDirectory, "TODO.md");
  return Layer.succeed(HarnessBacklogFileSystemService, {
    readDocuments: () =>
      Effect.gen(function* () {
        if (
          !backlogFile.endsWith("/BACKLOG.md") ||
          !roadmapFile.endsWith("/TODO.md")
        ) {
          return yield* new HarnessBacklogPathError({
            message:
              "Harness retro docs paths must stay inside the harness docs directory.",
          });
        }
        const backlog = yield* readUtf8(backlogFile, true);
        const roadmap = yield* readUtf8(roadmapFile, false);
        return { backlog, roadmap };
      }),
    writeBacklog: (contents) =>
      Effect.gen(function* () {
        if (!backlogFile.endsWith("/BACKLOG.md")) {
          return yield* new HarnessBacklogPathError({
            message: "Harness retro may only write docs/BACKLOG.md.",
          });
        }
        yield* Effect.tryPromise({
          try: () => writeFile(backlogFile, contents, "utf8"),
          catch: (cause) =>
            new HarnessBacklogFilesystemError({
              message: `Could not write ${backlogFile}: ${cause instanceof Error ? cause.message : String(cause)}`,
            }),
        });
      }),
  });
};

/** Live filesystem bound to `.pi-custom-harness/docs`, not the current worktree. */
export const HarnessBacklogLiveLayer =
  HarnessBacklogLiveLayerForDirectory(defaultDocsDirectory);
