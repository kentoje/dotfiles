import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { Schema } from "effect";

import type { WorktreeHost } from "../../worktree/module-port.js";

const setup = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("none") }),
  Schema.Struct({
    args: Schema.Array(Schema.String),
    command: Schema.NonEmptyString,
    kind: Schema.Literals(["after-create", "creates-worktree"]),
  }),
]);
const configuration = Schema.Struct({
  projects: Schema.Array(
    Schema.Struct({
      id: Schema.String.check(
        Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u)
      ),
      path: Schema.NonEmptyString,
      worktree: Schema.Struct({
        defaultBase: Schema.optionalKey(Schema.NonEmptyString),
        requiredArtifacts: Schema.Array(Schema.NonEmptyString),
        root: Schema.NonEmptyString,
        setup,
      }),
    })
  ),
});
/** Explicit host configuration owns executable setup; project files and tool arguments cannot supply it. */
export async function loadWorktreeHost(
  configPath: string | undefined,
  repositoryPath: string,
  sessionCwd: string
): Promise<WorktreeHost> {
  if (!configPath || !isAbsolute(configPath)) {
    throw new Error(
      "PI_HOST_CONFIG: set PI_COVENANT_CONFIG to an absolute host JSON file for worktree operations."
    );
  }
  const info = await stat(configPath);
  if (!info.isFile() || info.size > 262_144) {
    throw new Error(
      "PI_HOST_CONFIG: expected a regular file of at most 256 KiB."
    );
  }
  const value: unknown = JSON.parse(await readFile(configPath, "utf-8"));
  const config = Schema.decodeUnknownSync(configuration, {
    onExcessProperty: "error",
  })(value);
  const matches = await Promise.all(
    config.projects.map(async (project) => {
      if (!isAbsolute(project.path) || !isAbsolute(project.worktree.root)) {
        throw new Error(
          "PI_HOST_CONFIG: repository and worktree root must be absolute."
        );
      }
      return (await realpath(project.path)) === repositoryPath ? project : null;
    })
  );
  const selected = matches.filter((project) => project !== null);
  if (selected.length !== 1) {
    throw new Error(
      "PI_HOST_CONFIG: exactly one canonical repository configuration is required."
    );
  }
  const [project] = selected;
  if (!project) {
    throw new Error("PI_HOST_CONFIG: repository configuration missing.");
  }
  return {
    repositoryId: project.id,
    repositoryPath,
    sessionCwd,
    ...project.worktree,
  };
}
