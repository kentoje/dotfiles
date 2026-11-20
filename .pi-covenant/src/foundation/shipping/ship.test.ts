import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { contractTest } from "@covenant/vitest";
import {
  createAgentSession,
  DefaultResourceLoader,
  discoverAndLoadExtensions,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { expect, vi } from "vitest";

import { installPiFixtures } from "../testing/fixture.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";

const fixture = installPiFixtures();
const http = installLoopbackHttpFixtures();
contractTest("ship.integration", async () => {
  const f = await fixture();
  const repository = "https://gitlab.example/team/app";
  const bare = join(f.temp, "remote.git");
  const remoteGit = (...args: string[]) =>
    execFileSync("git", ["--git-dir", bare, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  f.git(["init", "--bare", bare]);
  f.git(["config", "user.name", "Fixture"]);
  f.git(["config", "user.email", "fixture@example.test"]);
  await f.write("unrelated.json", { old: 1 });
  f.git(["add", "package.json", "project-checks.json", "unrelated.json"]);
  f.git(["commit", "-m", "Add check profile"]);
  f.git(["push", bare, "main"]);
  f.git(["remote", "add", "origin", "git@gitlab.example:team/app.git"]);
  f.git([
    "config",
    "push.pushOption",
    "merge_request.merge_when_pipeline_succeeds",
  ]);
  f.git(["switch", "-c", "topic"]);
  await f.write("task.json", { new: 1 });
  await f.write("unrelated.json", { user: 1 });
  f.git(["add", "unrelated.json"]);
  const ssh = join(f.temp, "git-ssh-fixture");
  await writeFile(
    ssh,
    '#!/bin/sh\nexec git receive-pack "$SHIP_FIXTURE_REMOTE"\n',
    { mode: 0o700 }
  );
  const credentialFile = join(f.temp, "gitlab.yml");
  await writeFile(
    credentialFile,
    "hosts:\n  gitlab.example:\n    token: ship-fixture-token\n"
  );
  let draftTitle: string | null = null;
  const wireWrites: {
    path: string;
    method: string | undefined;
    body: unknown;
  }[] = [];
  const mr = () => ({
    draft: draftTitle?.startsWith("Draft:") ?? false,
    head_pipeline: {
      id: 17,
      ref: "topic",
      sha: remoteGit("rev-parse", "refs/heads/topic"),
      status: "success",
    },
    iid: 9,
    sha: remoteGit("rev-parse", "refs/heads/topic"),
    source_branch: "topic",
    source_project_id: 7,
    state: "opened",
    target_branch: "main",
    target_project_id: 7,
    title: draftTitle,
    web_url: `${repository}/-/merge_requests/9`,
  });
  const service = await http((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method === "GET") {
      response.setHeader("x-next-page", "");
      if (path.endsWith("/merge_requests")) {
        return response.end(JSON.stringify(draftTitle ? [mr()] : []));
      }
      if (path.endsWith("/discussions")) {
        return response.end("[]");
      }
      if (path.endsWith("/merge_requests/9")) {
        return response.end(JSON.stringify(mr()));
      }
      if (path.endsWith("/pipelines/17/jobs")) {
        const sha = remoteGit("rev-parse", "refs/heads/topic");
        return response.end(
          JSON.stringify([
            {
              id: 30,
              name: "check",
              pipeline: { id: 17, project_id: 7 },
              sha,
              status: "success",
            },
          ])
        );
      }
      if (path.endsWith("/pipelines/17")) {
        return response.end(JSON.stringify(mr().head_pipeline));
      }
      const branch = path.match(
        /\/repository\/branches\/(?<branch>main|topic)$/u
      )?.groups?.branch;
      if (branch) {
        return response.end(
          JSON.stringify({
            commit: { id: remoteGit("rev-parse", `refs/heads/${branch}`) },
            name: branch,
          })
        );
      }
      return response.end(
        JSON.stringify({
          default_branch: "main",
          id: 7,
          path_with_namespace: "team/app",
          web_url: repository,
        })
      );
    }
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(parts).toString());
      wireWrites.push({ body, method: request.method, path });
      if (
        body &&
        typeof body === "object" &&
        "title" in body &&
        typeof body.title === "string"
      ) {
        draftTitle = body.title;
        response.statusCode = request.method === "POST" ? 201 : 200;
        response.end(JSON.stringify(mr()));
      } else {
        response.writeHead(400).end();
      }
    });
  });
  vi.stubEnv("PI_COVENANT_GITLAB_HOST", "gitlab.example");
  vi.stubEnv("PI_COVENANT_GITLAB_CREDENTIAL_FILE", credentialFile);
  vi.stubEnv("PI_COVENANT_GITLAB_API_ORIGIN", service.origin);
  vi.stubEnv("GIT_SSH_COMMAND", ssh);
  vi.stubEnv("GIT_SSH_VARIANT", "simple");
  vi.stubEnv("SHIP_FIXTURE_REMOTE", bare);
  try {
    const agentDir = join(f.temp, "agent");
    const loaded = await discoverAndLoadExtensions(
      [resolve("src/foundation/extension.ts")],
      f.repo,
      agentDir
    );
    expect(loaded.errors).toStrictEqual([]);
    const runtime = await ModelRuntime.create({
      allowModelNetwork: false,
      authPath: join(f.temp, "auth.json"),
      modelsPath: null,
      modelsStorePath: join(f.temp, "models"),
      refreshOnCreate: false,
    });
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      agentDir,
      cwd: f.repo,
      extensionsOverride: () => loaded,
      noContextFiles: true,
      noExtensions: true,
      noPromptTemplates: true,
      noSkills: true,
      noThemes: true,
      settingsManager,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      agentDir,
      cwd: f.repo,
      modelRuntime: runtime,
      resourceLoader,
      sessionManager: SessionManager.inMemory(f.repo),
      settingsManager,
    });
    try {
      const runner = session.extensionRunner;
      const command = runner.getCommand("ship");
      if (!command) {
        throw new Error("Pi SDK did not register /ship");
      }
      const context = runner.createCommandContext();
      const reports: string[] = [];
      const bound = {
        ...context,
        ui: {
          ...context.ui,
          notify: (report: string) => {
            reports.push(report);
          },
        },
      };
      expect(service.requests).toHaveLength(0);
      await command.handler(
        JSON.stringify({
          commit_message: "Implement task",
          task_paths: ["task.json"],
          title: "Implement task",
        }),
        bound
      );
      expect(reports.join("\n")).toContain("ready_for_review");
      expect(remoteGit("show", "--format=", "--name-only", "topic")).toBe(
        "task.json"
      );
      expect(f.git(["diff", "--cached", "--name-only"]).toString().trim()).toBe(
        "unrelated.json"
      );
      expect(wireWrites).toStrictEqual([
        {
          body: {
            source_branch: "topic",
            target_branch: "main",
            title: "Draft: Implement task",
          },
          method: "POST",
          path: "/api/v4/projects/7/merge_requests",
        },
        {
          body: { title: "Implement task" },
          method: "PUT",
          path: "/api/v4/projects/7/merge_requests/9",
        },
      ]);
    } finally {
      session.dispose();
    }
  } finally {
    vi.unstubAllEnvs();
  }
});
