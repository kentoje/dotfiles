import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { contractTest } from "@covenant/vitest";
import type {
  ExtensionRunner,
  RegisteredTool,
} from "@earendil-works/pi-coding-agent";
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

import { installPiFixtures } from "../testing/fixture.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";

const fixture = installPiFixtures();
const gitlabFixture = installLoopbackHttpFixtures();
async function checkMrInPi(
  loadedTool: RegisteredTool | undefined,
  runner: ExtensionRunner,
  checkout: string,
  requests: readonly { method: string | undefined; url: string | undefined }[]
) {
  const mr = loadedTool;
  if (!mr) {
    throw new Error("PI_SDK_TEST: MR tool missing");
  }
  const mrTool = wrapRegisteredTool(mr, runner);
  await expect(
    mrTool.execute(
      "mr-status",
      { action: "status", cwd: checkout, iid: 9 },
      undefined
    )
  ).resolves.toMatchObject({
    details: { data: { merge_request: { iid: 9 } }, status: "ok" },
  });
  const start = requests.length;
  const create = (branch: string) =>
    `cd "${
      checkout
    }" && glab mr create -R https://gitlab.example/team/other -s ${
      branch
    } -b main -t "Reviewed"`;
  const call = (command: string) =>
    runner.emitToolCall({
      input: { command },
      toolCallId: "mr-guard",
      toolName: "bash",
      type: "tool_call",
    });
  await expect(call("git status")).resolves.toBeUndefined();
  expect(requests).toHaveLength(start);
  await expect(call(create("feature/guard"))).resolves.toMatchObject({
    block: true,
    reason: expect.stringContaining("!9"),
  });
  await expect(call(create("feature/other"))).resolves.toBeUndefined();
  await expect(call("glab mr new --fill")).resolves.toMatchObject({
    block: true,
  });
  expect(
    requests.slice(start).every(({ method }) => method === "GET")
  ).toBeTruthy();
  expect(
    requests
      .slice(start)
      .some(({ url }) => url?.includes("projects/8/merge_requests?"))
  ).toBeTruthy();
}

contractTest("foundation.sdk", async () => {
  const f = await fixture();
  const other = await fixture();
  other.git(["remote", "add", "origin", "https://gitlab.example/team/other"]);
  f.git(["remote", "add", "origin", "https://gitlab.example/team/app"]);
  const mrDetail = {
    iid: 9,
    sha: "checked-sha",
    source_branch: "feature/guard",
    source_project_id: 8,
    state: "opened",
    target_branch: "main",
    target_project_id: 8,
    title: "Existing",
    web_url: "https://gitlab.example/team/other/-/merge_requests/9",
  };
  const service = await gitlabFixture((req, res) => {
    const path = req.url ?? "";
    if (path.includes("/merge_requests?")) {
      res.setHeader("x-next-page", "");
      const url = new URL(path, "http://localhost");
      return res.end(
        JSON.stringify(
          url.searchParams.get("source_branch") === "feature/guard"
            ? [mrDetail]
            : []
        )
      );
    }
    if (path.endsWith("/merge_requests/9")) {
      return res.end(JSON.stringify(mrDetail));
    }
    if (path.endsWith("/discussions")) {
      res.setHeader("x-next-page", "");
      return res.end("[]");
    }
    if (path.endsWith("team%2Fother")) {
      return res.end(
        JSON.stringify({
          default_branch: "main",
          id: 8,
          path_with_namespace: "team/other",
          web_url: "https://gitlab.example/team/other",
        })
      );
    }
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
  const jiraService = await gitlabFixture((_req, res) =>
    res.end(
      JSON.stringify({
        fields: { status: { name: "Open" }, summary: "SDK issue" },
        id: "12",
        key: "APP-1",
      })
    )
  );
  const jiraCredentials = join(f.temp, "jira-token");
  await writeFile(jiraCredentials, "jira-sdk-token", { mode: 0o600 });
  vi.stubEnv("PI_COVENANT_JIRA_SITE", jiraService.origin);
  vi.stubEnv("PI_COVENANT_JIRA_EMAIL", "sdk@example.test");
  vi.stubEnv("PI_COVENANT_JIRA_CREDENTIAL_FILE", jiraCredentials);
  const credentials = join(f.temp, "gitlab.yml");
  await writeFile(
    credentials,
    "hosts:\n  gitlab.example:\n    token: sdk-secret-token\n"
  );
  vi.stubEnv("PI_COVENANT_INTERCEPT_MR_CREATION", "1");
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
    "jira",
    "mr",
  ]);
  expect([...extension.handlers.keys()]).toStrictEqual(["tool_call"]);
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
        "jira",
        "mr",
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
    const jira = extension.tools.get("jira");
    if (!jira) {
      throw new Error("PI_SDK_TEST: Jira tool missing");
    }
    const jiraTool = wrapRegisteredTool(jira, session.extensionRunner);
    await expect(
      jiraTool.execute("jira-get", { action: "get", key: "APP-1" }, undefined)
    ).resolves.toMatchObject({
      details: { data: { key: "APP-1", summary: "SDK issue" }, status: "ok" },
    });
    await expect(
      jiraTool.execute(
        "jira-headless",
        { action: "comment", body: "Write", key: "APP-1" },
        undefined
      )
    ).resolves.toMatchObject({
      details: { error: { code: "AUTHORIZATION_REQUIRED" }, status: "blocked" },
    });
    expect(jiraService.requests.map(({ method }) => method)).toStrictEqual([
      "GET",
      "GET",
    ]);
    await checkMrInPi(
      extension.tools.get("mr"),
      session.extensionRunner,
      other.repo,
      service.requests
    );
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
