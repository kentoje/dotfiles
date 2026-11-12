import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { resolveProjectContext } from "../module-port.js";

contractTest("repository-context.gitlab-target", async () => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), "gitlab-target-")));
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
  const host = {
    gitlab: { allowedHosts: ["gitlab.example"] },
    sessionCwd: repo,
  };
  try {
    git(["init", "-b", "topic"]);
    git(["remote", "add", "origin", "git@gitlab.example:team/app.git"]);
    git(["remote", "add", "duplicate", "https://gitlab.example/team/app.git"]);
    const found = await resolveProjectContext({}, host);
    expect(found.data?.gitlab_target).toMatchObject({
      host: "gitlab.example",
      project_path: "team/app",
    });
    expect(found.data?.branch).toBe("topic");
    git(["remote", "add", "other", "https://gitlab.example/another/project"]);
    expect((await resolveProjectContext({}, host)).status).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { repository: "https://gitlab.example/team/app" },
          host
        )
      ).data?.gitlab_target?.project_path
    ).toBe("team/app");
    expect(
      (
        await resolveProjectContext(
          { cwd: repo, repository: "https://gitlab.example/not/this-project" },
          host
        )
      ).status
    ).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { repository: "https://token@gitlab.example/team/app" },
          host
        )
      ).status
    ).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { repository: "https://gitlab.example/team/%2e%2e/app" },
          host
        )
      ).status
    ).toBe("blocked");
    expect(
      (
        await resolveProjectContext(
          { repository: "https://unapproved.example/team/app" },
          host
        )
      ).status
    ).toBe("blocked");
    const outside = { ...host, sessionCwd: temp };
    expect(
      (
        await resolveProjectContext(
          { repository: "https://gitlab.example/team/app" },
          outside
        )
      ).data?.gitlab_target
    ).toMatchObject({ remote_name: null });
    expect(
      (
        await resolveProjectContext(
          { repository: "gitlab.example:8443/team/app" },
          {
            gitlab: { allowedHosts: ["gitlab.example:8443"] },
            sessionCwd: temp,
          }
        )
      ).data?.gitlab_target?.host
    ).toBe("gitlab.example:8443");
    expect(
      (
        await resolveProjectContext(
          { repository: "ssh://git@alias/team/app" },
          {
            gitlab: {
              allowedHosts: ["gitlab.example"],
              hostMappings: { alias: "gitlab.example" },
            },
            sessionCwd: temp,
          }
        )
      ).data?.gitlab_target?.host
    ).toBe("gitlab.example");
    await writeFile(
      join(repo, ".git/config.worktree"),
      '[remote "origin"]\n url = https://gitlab.example/not/this\n'
    );
    expect((await resolveProjectContext({}, host)).status).toBe("blocked");
    await rm(join(repo, ".git/config.worktree"));
    await writeFile(
      join(repo, ".git/config"),
      "[include]\n path = /not/allowed\n"
    );
    expect((await resolveProjectContext({}, host)).status).toBe("blocked");
    expect((await resolveProjectContext({}, { sessionCwd: repo })).status).toBe(
      "ok"
    );
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});
