import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";

import { makeWorktreeModule } from "../module-port.js";
import type { WorktreeHost } from "../module-port.js";

/** Real isolated Git repository; never reads developer Git hooks or credentials. */
async function worktreeFixture(overrides: Partial<WorktreeHost> = {}) {
  const temp = await mkdtemp(join(tmpdir(), "covenant-worktree-"));
  const repositoryPath = join(temp, "repo");
  const root = join(temp, "tasks");
  await mkdir(repositoryPath);
  await mkdir(root);
  const git = (args: string[], cwd = repositoryPath) =>
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
      cwd,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(["init", "-b", "main"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "Fixture"]);
  await writeFile(join(repositoryPath, "tracked"), "initial\n");
  git(["add", "."]);
  git(["commit", "-m", "fixture"]);
  const host: WorktreeHost = {
    defaultBase: "main",
    repositoryId: "fixture",
    repositoryPath,
    requiredArtifacts: [],
    root,
    sessionCwd: repositoryPath,
    setup: { kind: "none" },
    ...overrides,
  };
  return {
    cleanup: () => rm(temp, { force: true, recursive: true }),
    git,
    host,
    module: makeWorktreeModule(host),
    repositoryPath,
    root,
    temp,
  };
}

/** Register cleanup in the current test suite and return an isolated fixture factory. */
export function installWorktreeFixtures() {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  });
  return async () => {
    const fixture = await worktreeFixture();
    cleanups.push(fixture.cleanup);
    return fixture;
  };
}
