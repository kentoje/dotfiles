import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  realpath,
  mkdir,
  writeFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { resolveProjectContext } from "../module-port.js";

contractTest("repository-context.local", async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "pi-context-")));
  try {
    const repo = join(temp, "repo");
    const linked = join(temp, "linked");
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
    git(["worktree", "add", "-b", "task", linked]);
    await mkdir(join(linked, "nested"));
    await symlink(linked, join(temp, "alias"));
    const result = await resolveProjectContext(
      { cwd: "alias/nested" },
      { sessionCwd: temp }
    );
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      branch: "task",
      git_root: repo,
      project_root: linked,
      worktree_root: linked,
    });
    expect(result.data?.head_sha).toMatch(/^[a-f0-9]{40}$/u);
    expect(result.data?.sources).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ fact: "project_root" }),
      ])
    );
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
contractTest("repository-context.unavailable", async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "pi-context-")));
  try {
    await writeFile(join(temp, "package.json"), "{}");
    await mkdir(join(temp, "nested"));
    const result = await resolveProjectContext(
      {},
      { sessionCwd: join(temp, "nested") }
    );
    expect(result.data).toMatchObject({
      branch: null,
      git_root: null,
      head_sha: null,
      project_root: temp,
    });
    expect(result.data?.unavailable.length).toBeGreaterThan(0);
    expect(
      (await resolveProjectContext({ cwd: "absent" }, { sessionCwd: temp }))
        .status
    ).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { repository: "invented" },
          { sessionCwd: temp }
        )
      ).status
    ).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { cwd: temp, unknown: true },
          { sessionCwd: temp }
        )
      ).status
    ).toBe("blocked");
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
