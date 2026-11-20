import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { createMrTool } from "../registration/mr-tool.js";
import { installPiFixtures } from "../testing/fixture.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";

const fixture = installPiFixtures();
const http = installLoopbackHttpFixtures();
const repository = "https://gitlab.example/team/app";
const discussion = {
  id: "thread",
  individual_note: false,
  notes: [
    {
      author: { id: 2, name: "Reviewer" },
      body: "Review",
      id: 12,
      resolvable: true,
      resolved: false,
    },
  ],
};
contractTest("mr.http", async () => {
  const f = await fixture();
  f.git(["remote", "add", "origin", repository]);
  const file = join(f.temp, "gitlab.yml");
  await writeFile(
    file,
    "hosts:\n  gitlab.example:\n    token: mr-test-token\n"
  );
  let title = "Original";
  const writes: { path: string; method: string | undefined; body: unknown }[] =
    [];
  const mr = () => ({
    description: "Description",
    head_pipeline: { id: 42, ref: "main", sha: "sha-a", status: "success" },
    iid: 9,
    sha: "sha-b",
    source_branch: "main",
    source_project_id: 7,
    state: "opened",
    target_branch: "release",
    target_project_id: 7,
    title,
  });
  const service = await http((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method === "GET") {
      response.setHeader("x-next-page", "");
      const bodies = new Map<string, unknown>([
        [
          "/api/v4/projects/team%2Fapp",
          {
            default_branch: "main",
            id: 7,
            path_with_namespace: "team/app",
            web_url: repository,
          },
        ],
        ["/api/v4/projects/7/merge_requests/9", mr()],
        ["/api/v4/projects/7/merge_requests/9/discussions", [discussion]],
        ["/api/v4/projects/7/merge_requests/9/discussions/thread", discussion],
      ]);
      return response.end(JSON.stringify(bodies.get(path)));
    }
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(parts).toString());
      writes.push({ body, method: request.method, path });
      if (path.endsWith("/notes")) {
        response.statusCode = 201;
        response.end(JSON.stringify({ id: 91 }));
      } else if (path.endsWith("/discussions/thread")) {
        response.statusCode = 403;
        response.end();
      } else {
        title = "Changed";
        response.end(JSON.stringify(mr()));
      }
    });
  });
  const tool = createMrTool({
    gitlab: {
      apiOrigin: service.origin,
      credentialFile: file,
      host: "gitlab.example",
    },
  });
  const ctx = {
    cwd: f.repo,
    hasUI: true,
    ui: { confirm: () => Promise.resolve(true) },
  };
  const execute = (args: object) =>
    tool.execute("mr-fixture", { iid: 9, ...args }, undefined, undefined, ctx);
  await expect(execute({ action: "status" })).resolves.toMatchObject({
    details: { data: { pipeline_matches_head: false, unresolved_count: 1 } },
  });
  await expect(execute({ action: "threads" })).resolves.toMatchObject({
    details: {
      data: { complete: true, threads: [{ body: "Review", id: "thread" }] },
    },
  });
  await expect(
    execute({
      action: "reply",
      body: "Applied",
      resolve: true,
      thread_id: "thread",
    })
  ).resolves.toMatchObject({
    details: {
      data: { reply_id: "91", resolution_state: "failed" },
      status: "partial",
    },
  });
  await expect(
    execute({ action: "update", title: "Changed" })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  expect(writes).toStrictEqual([
    {
      body: { body: "Applied" },
      method: "POST",
      path: "/api/v4/projects/7/merge_requests/9/discussions/thread/notes",
    },
    {
      body: { resolved: true },
      method: "PUT",
      path: "/api/v4/projects/7/merge_requests/9/discussions/thread",
    },
    {
      body: { title: "Changed" },
      method: "PUT",
      path: "/api/v4/projects/7/merge_requests/9",
    },
  ]);
  expect(
    service.requests.every(
      ({ privateToken }) => privateToken === "mr-test-token"
    )
  ).toBeTruthy();
});
