import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect, vi } from "vitest";

import { installPiFixtures } from "../testing/fixture.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";
import { createGitlabTool } from "./gitlab-tool.js";

const fixture = installLoopbackHttpFixtures();
const project = installPiFixtures();
contractTest("gitlab.surface", async () => {
  const root = await project();
  const server = await fixture((req, res) => {
    if (req.url?.includes("/pipelines/42")) {
      return res.end(
        JSON.stringify({
          id: 42,
          project_id: 7,
          ref: "main",
          sha: "fixture-commit",
          status: req.method === "POST" ? "canceled" : "running",
        })
      );
    }
    return res.end(
      JSON.stringify({
        default_branch: null,
        id: 7,
        path_with_namespace: "team/app",
        web_url: "https://gitlab.example/team/app",
      })
    );
  });
  const credentialFile = join(root.temp, "gitlab.yml");
  await writeFile(
    credentialFile,
    "hosts:\n  gitlab.example:\n    token: pi-fixture-token\n"
  );
  const tool = createGitlabTool({
    gitlab: {
      apiOrigin: server.origin,
      credentialFile,
      host: "gitlab.example",
    },
  });
  expect(
    tool.parameters.properties.action.anyOf.map((item) => item.const)
  ).toStrictEqual([
    "repository",
    "pipelines",
    "pipeline",
    "jobs",
    "job",
    "logs",
    "retry",
    "cancel",
  ]);
  const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  const result = await tool.execute(
    "cancel",
    {
      action: "cancel",
      pipeline_id: 42,
      repository: "https://gitlab.example/team/app",
    },
    undefined,
    undefined,
    { cwd: root.repo, hasUI: true, ui: { confirm } }
  );
  expect(result.details).toMatchObject({
    error: { code: "AUTHORIZATION_REQUIRED" },
  });
  expect(confirm).toHaveBeenCalledWith(
    expect.any(String),
    expect.stringContaining("cancel pipeline 42 in gitlab.example/team/app"),
    expect.any(Object)
  );
  expect(server.requests.map((req) => req.method)).toStrictEqual(["GET"]);
  const privateAction = await tool.execute(
    "private",
    {
      action: "lookup_open_mrs",
      repository: "https://gitlab.example/team/app",
      source_branch: "main",
    },
    undefined,
    undefined,
    { cwd: root.repo, hasUI: true, ui: { confirm } }
  );
  expect(privateAction.isError).toBeTruthy();
  expect(server.requests).toHaveLength(1);
  confirm.mockResolvedValueOnce(true);
  const approved = await tool.execute(
    "cancel-approved",
    {
      action: "cancel",
      pipeline_id: 42,
      repository: "https://gitlab.example/team/app",
    },
    undefined,
    undefined,
    { cwd: root.repo, hasUI: true, ui: { confirm } }
  );
  expect(approved.details).toMatchObject({
    data: { cancellation_confirmed: true, request_state: "accepted" },
    status: "ok",
  });
  expect(server.requests.filter((req) => req.method === "POST")).toMatchObject([
    { url: "/api/v4/projects/7/pipelines/42/cancel" },
  ]);
});
