import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

import { RepoMapService } from "./core";
import { RepoMapLiveLayer } from "./live";

const temporaryRepositories: Array<string> = [];

afterEach(() => {
  for (const temporaryRepository of temporaryRepositories) {
    rmSync(temporaryRepository, { force: true, recursive: true });
  }
  temporaryRepositories.length = 0;
});

test("detects changesets before semantic-release and no release gate from repository files", async () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "pi-custom-harness-repo-map-"));
  temporaryRepositories.push(repositoryPath);

  for (const command of [
    ["git", "init", "--initial-branch=main"],
    ["mkdir", ".changeset"],
  ]) {
    const process = Bun.spawnSync(command, { cwd: repositoryPath });
    expect(process.exitCode).toBe(0);
  }
  writeFileSync(
    join(repositoryPath, "package.json"),
    JSON.stringify({ devDependencies: { "semantic-release": "1.0.0" } }),
  );

  const releaseGateFor = (cwd: string) =>
    Effect.runPromise(
      RepoMapService.use((service) => service.releaseGateFor({ cwd })).pipe(
        Effect.provide(RepoMapLiveLayer),
      ),
    );

  await expect(releaseGateFor(repositoryPath)).resolves.toBe("changeset");

  rmSync(join(repositoryPath, ".changeset"), { force: true, recursive: true });
  await expect(releaseGateFor(repositoryPath)).resolves.toBe(
    "conventional-commits",
  );

  writeFileSync(join(repositoryPath, "package.json"), "{}");
  await expect(releaseGateFor(repositoryPath)).resolves.toBe("none");
});

test("fails closed outside a Git repository", async () => {
  const directoryPath = mkdtempSync(join(tmpdir(), "pi-custom-harness-repo-map-"));
  temporaryRepositories.push(directoryPath);

  await expect(
    Effect.runPromise(
      RepoMapService.use((service) => service.releaseGateFor({ cwd: directoryPath })).pipe(
        Effect.provide(RepoMapLiveLayer),
      ),
    ),
  ).rejects.toMatchObject({
    _tag: "RepositoryReleaseGateLookupError",
  });
});
