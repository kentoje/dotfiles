import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { makeGitlabModule } from "../module-port.js";

contractTest("gitlab.context", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "gitlab-module-")));
  await writeFile(join(root, "package.json"), "{}");
  const requests: string[] = [];
  const module = makeGitlabModule({
    readProject: (target) => {
      requests.push(target.project_path);
      return Effect.succeed({
        body: {
          default_branch: null,
          id: 7,
          path_with_namespace: target.project_path,
          web_url: "https://gitlab.example/team/app",
        },
        kind: "ok",
      });
    },
    selection: { allowedHosts: ["gitlab.example"] },
    sessionCwd: root,
  });
  try {
    const result = await Effect.runPromise(
      module.repository({ repository: "https://gitlab.example/team/app" })
    );
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      default_branch: null,
      identity: {
        branch: null,
        head_sha: null,
        host: "gitlab.example",
        repository: "team/app",
      },
    });
    const git = (args: string[]) =>
      execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
        cwd: root,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
        stdio: "pipe",
      });
    git(["init", "-b", "topic"]);
    git(["remote", "add", "origin", "git@gitlab.example:team/app.git"]);
    expect(
      (await Effect.runPromise(module.repository({}))).data?.identity.branch
    ).toBe("topic");
    const bad = await Effect.runPromise(
      module.repository({ repository: "https://elsewhere.example/team/app" })
    );
    expect(bad.status).toBe("blocked");
    expect(
      (
        await Effect.runPromise(
          module.repository({
            approval: true,
            repository: "https://gitlab.example/team/app",
          })
        )
      ).status
    ).toBe("blocked");
    expect(requests).toStrictEqual(["team/app", "team/app"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
