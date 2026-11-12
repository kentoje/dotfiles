import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach } from "vitest";
/** Disposable real project and trusted host config; no user settings or service credentials. */
export function installPiFixtures() {
  const cleanups: string[] = [];
  afterEach(async () => {
    await Promise.all(
      cleanups
        .splice(0)
        .map((path) => rm(path, { force: true, recursive: true }))
    );
  });
  return async () => {
    const temp = await realpath(await mkdtemp(join(tmpdir(), "pi-harness-")));
    cleanups.push(temp);
    const repo = join(temp, "repo");
    await mkdir(repo);
    const git = (args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: repo,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
        stdio: "pipe",
      });
    git(["init", "-b", "main"]);
    git([
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    ]);
    const write = (path: string, value: unknown) =>
      writeFile(join(repo, path), JSON.stringify(value));
    await write("package.json", {
      scripts: { test: 'node -e "process.exit(0)"' },
    });
    await write("project-checks.json", {
      checks: [
        {
          args: ["-e", "process.exit(0)"],
          command: process.execPath,
          id: "test",
        },
      ],
    });
    const config = join(temp, "host.json");
    const configValue = {
      projects: [
        {
          id: "fixture",
          path: repo,
          worktree: {
            defaultBase: "main",
            requiredArtifacts: [],
            root: join(temp, "worktrees"),
            setup: { kind: "none" },
          },
        },
      ],
    };
    await writeFile(config, JSON.stringify(configValue));
    return { config, configValue, git, repo, temp, write };
  };
}
