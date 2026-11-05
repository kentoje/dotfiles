import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

const projects: string[] = [];
afterEach(async () => {
  await Promise.all(
    projects
      .splice(0)
      .map((project) => rm(project, { force: true, recursive: true }))
  );
});

/** Isolated non-Git project; fixture commands use the actual Node executable. */
export async function projectCheckFixture() {
  const created = await mkdtemp(join(tmpdir(), "project-check-fixture-"));
  const project = await realpath(created);
  projects.push(project);
  return {
    nodeCheck: (id: string, source = "process.exit(0)", timeout_ms = 1000) => ({
      args: ["-e", source],
      command: process.execPath,
      id,
      timeout_ms,
    }),
    project,
    write: (path: string, value: unknown) =>
      writeFile(join(project, path), JSON.stringify(value)),
  };
}
