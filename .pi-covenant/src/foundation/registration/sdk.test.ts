import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { contractTest } from "@covenant/vitest";
import {
  discoverAndLoadExtensions,
  SessionManager,
  ModelRuntime,
  createAgentSession,
  DefaultResourceLoader,
  SettingsManager,
  wrapRegisteredTool,
} from "@earendil-works/pi-coding-agent";
import { expect, vi } from "vitest";

import { installGitlabHttpFixtures } from "../gitlab/http-fixture.js";
import { installPiFixtures } from "../testing/fixture.js";

const fixture = installPiFixtures();
const gitlabFixture = installGitlabHttpFixtures();
contractTest("foundation.sdk", async () => {
  const f = await fixture();
  const service = await gitlabFixture((req, res) => {
    const path = req.url ?? "";
    if (path.endsWith("/trace")) {
      return res.end("boot sdk-secret-token done");
    }
    if (path.includes("/pipelines?")) {
      res.setHeader("x-next-page", "");
      return res.end(
        JSON.stringify([
          {
            id: 42,
            project_id: 7,
            ref: "main",
            sha: "fixture-commit",
            status: "failed",
          },
        ])
      );
    }
    return res.end(
      JSON.stringify({
        default_branch: "main",
        id: 7,
        path_with_namespace: "team/app",
        web_url: "https://gitlab.example/team/app",
      })
    );
  });
  const credentials = join(f.temp, "gitlab.yml");
  await writeFile(
    credentials,
    "hosts:\n  gitlab.example:\n    token: sdk-secret-token\n"
  );
  vi.stubEnv("PI_COVENANT_GITLAB_HOST", "gitlab.example");
  vi.stubEnv("PI_COVENANT_GITLAB_CREDENTIAL_FILE", credentials);
  vi.stubEnv("PI_COVENANT_GITLAB_API_ORIGIN", service.origin);
  const loaded = await discoverAndLoadExtensions(
    [resolve("src/foundation/extension.ts")],
    f.repo,
    join(f.temp, "agent")
  ).finally(() => vi.unstubAllEnvs());
  expect(loaded.errors).toStrictEqual([]);
  expect(loaded.extensions).toHaveLength(1);
  const [extension] = loaded.extensions;
  if (!extension) {
    throw new Error("PI_SDK_TEST: extension missing");
  }
  expect([...extension.tools.keys()]).toStrictEqual([
    "project_cli",
    "worktree",
    "gitlab",
  ]);
  expect(extension.handlers.size).toBe(0);
  const runtime = await ModelRuntime.create({
    allowModelNetwork: false,
    authPath: join(f.temp, "auth.json"),
    modelsPath: null,
    modelsStorePath: join(f.temp, "models"),
    refreshOnCreate: false,
  });
  const settingsManager = SettingsManager.inMemory();
  const resourceLoader = new DefaultResourceLoader({
    agentDir: join(f.temp, "agent"),
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
    agentDir: join(f.temp, "agent"),
    cwd: f.repo,
    modelRuntime: runtime,
    resourceLoader,
    sessionManager: SessionManager.inMemory(f.repo),
    settingsManager,
  });
  try {
    expect(session.getActiveToolNames()).toStrictEqual(
      expect.arrayContaining([
        "read",
        "bash",
        "edit",
        "write",
        "project_cli",
        "worktree",
        "gitlab",
      ])
    );
    const gitlab = extension.tools.get("gitlab");
    if (!gitlab) {
      throw new Error("PI_SDK_TEST: GitLab tool missing");
    }
    const gitlabTool = wrapRegisteredTool(gitlab, session.extensionRunner);
    const read = await gitlabTool.execute(
      "gitlab-read",
      { action: "repository", repository: "https://gitlab.example/team/app" },
      undefined
    );
    expect(read.details).toMatchObject({
      data: { default_branch: "main" },
      status: "ok",
    });
    const selection = { repository: "https://gitlab.example/team/app" };
    const pipelines = await gitlabTool.execute(
      "gitlab-pipelines",
      { ...selection, action: "pipelines", ref: "main" },
      undefined
    );
    expect(pipelines.details).toMatchObject({
      data: { complete: true, items: [{ id: 42, state: "failed" }] },
      status: "ok",
    });
    const logs = await gitlabTool.execute(
      "gitlab-logs",
      { ...selection, action: "logs", job_id: 8 },
      undefined
    );
    expect(logs.details).toMatchObject({
      data: { has_more: false, job_id: 8, redacted: true },
      status: "ok",
    });
    expect(JSON.stringify(logs)).not.toContain("sdk-secret-token");
    const headless = await gitlabTool.execute(
      "gitlab-headless",
      { ...selection, action: "cancel", pipeline_id: 42 },
      undefined
    );
    expect(headless.details).toMatchObject({
      error: { code: "AUTHORIZATION_REQUIRED" },
      status: "blocked",
    });
    expect(service.requests).toHaveLength(6);
    expect(
      service.requests.every(
        (req) => req.method === "GET" && req.privateToken === "sdk-secret-token"
      )
    ).toBeTruthy();
    const project = extension.tools.get("project_cli");
    if (!project) {
      throw new Error("PI_SDK_TEST: project tool missing");
    }
    const tool = wrapRegisteredTool(project, session.extensionRunner);
    const result = await tool.execute(
      "sdk-check",
      { action: "check" },
      undefined
    );
    expect(result.isError).toBeFalsy();
    expect(result.details).toMatchObject({
      checks: [{ status: "passed" }],
      exit_code: 0,
    });
    const invalid = await tool.execute(
      "sdk-invalid",
      { action: "check", approval: true },
      undefined
    );
    expect(invalid.isError).toBeTruthy();
  } finally {
    session.dispose();
  }
});
