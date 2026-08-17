import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

import { GitService } from "./core";
import { GitLiveLayer } from "./live";

const temporaryRepositories: Array<string> = [];

afterEach(() => {
  for (const temporaryRepository of temporaryRepositories) {
    rmSync(temporaryRepository, { force: true, recursive: true });
  }
  temporaryRepositories.length = 0;
});

const runGit = (repositoryPath: string, arguments_: ReadonlyArray<string>) => {
  const process = Bun.spawnSync(["git", ...arguments_], {
    cwd: repositoryPath,
  });
  expect(process.exitCode).toBe(0);
};

const createPushedFeatureRepository = (commitSubject: string): string => {
  const repositoryPath = mkdtempSync(join(tmpdir(), "pi-custom-harness-git-"));
  temporaryRepositories.push(repositoryPath);
  const remotePath = join(repositoryPath, "remote.git");

  runGit(repositoryPath, ["init", "--bare", remotePath]);
  runGit(repositoryPath, ["init", "--initial-branch=main"]);
  runGit(repositoryPath, ["config", "user.email", "harness@example.test"]);
  runGit(repositoryPath, ["config", "user.name", "Harness Test"]);
  runGit(repositoryPath, ["remote", "add", "origin", remotePath]);
  runGit(repositoryPath, ["commit", "--allow-empty", "-m", "Initial commit"]);
  runGit(repositoryPath, ["push", "-u", "origin", "main"]);
  runGit(repositoryPath, [
    "remote",
    "set-head",
    "origin",
    "-a",
  ]);
  runGit(repositoryPath, ["checkout", "-b", "CI-1"]);
  runGit(repositoryPath, ["config", "branch.CI-1.remote", "origin"]);
  runGit(repositoryPath, ["config", "branch.CI-1.merge", "refs/heads/CI-1"]);
  runGit(repositoryPath, ["config", "branch.CI-1.pushRemote", "origin"]);
  runGit(repositoryPath, ["config", "branch.CI-1.rebase", "false"]);
  runGit(repositoryPath, ["config", "push.autoSetupRemote", "true"]);
  runGit(repositoryPath, ["config", "branch.CI-1.description", ""]);
  runGit(repositoryPath, ["config", "branch.CI-1.vscode-merge-base", "origin/main"]);

  const changesetDirectory = join(repositoryPath, ".changeset");
  const changesetProcess = Bun.spawnSync(["mkdir", "-p", changesetDirectory]);
  expect(changesetProcess.exitCode).toBe(0);
  const changesetFile = Bun.file(join(changesetDirectory, "foo.md"));
  void Bun.write(changesetFile, "---\n");
  runGit(repositoryPath, ["add", ".changeset/foo.md"]);
  runGit(repositoryPath, ["commit", "-m", commitSubject]);
  runGit(repositoryPath, ["push", "-u", "origin", "CI-1"]);

  return repositoryPath;
};

test("recognizes a changeset after the feature branch is pushed", async () => {
  const repositoryPath = createPushedFeatureRepository("feat: add changeset");

  const hasChangeset = await Effect.runPromise(
    GitService.use((service) =>
      service.hasChangesetOnCurrentBranch({ cwd: repositoryPath }),
    ).pipe(Effect.provide(GitLiveLayer)),
  );

  expect(hasChangeset).toBe(true);
});

test("rejects a non-conventional commit after the feature branch is pushed", async () => {
  const repositoryPath = createPushedFeatureRepository("Update duration filter");

  const commitsAreConventional = await Effect.runPromise(
    GitService.use((service) =>
      service.commitsAreConventional({ cwd: repositoryPath }),
    ).pipe(Effect.provide(GitLiveLayer)),
  );

  expect(commitsAreConventional).toBe(false);
});
