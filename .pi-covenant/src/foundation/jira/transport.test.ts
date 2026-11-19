import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { createJiraTool } from "../registration/jira-tool.js";
import { installPiFixtures } from "../testing/fixture.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";

const fixture = installPiFixtures();
const server = installLoopbackHttpFixtures();
contractTest("jira.http", async () => {
  const f = await fixture();
  const credentialFile = join(f.temp, "jira-token");
  await writeFile(credentialFile, "fixture-jira-token\n", { mode: 0o600 });
  const writes: { method: string | undefined; path: string; body: unknown }[] =
    [];
  const issue = {
    fields: {
      project: { key: "APP" },
      status: { name: "Open" },
      summary: "visible fixture-jira-token",
    },
    id: "42",
    key: "APP-1",
  };
  const fixtures: Record<string, unknown> = {
    "/rest/api/3/issue/APP-1": issue,
    "/rest/api/3/issue/APP-1/editmeta": {
      fields: { summary: { name: "Summary", schema: { type: "string" } } },
    },
    "/rest/api/3/issue/APP-1/transitions": {
      transitions: [{ fields: {}, id: "9", name: "Close" }],
    },
    "/rest/api/3/issue/createmeta/APP/issuetypes": {
      issueTypes: [{ id: "10", name: "Bug" }],
      startAt: 0,
      total: 1,
    },
    "/rest/api/3/issue/createmeta/APP/issuetypes/10": {
      fields: [],
      startAt: 0,
      total: 0,
    },
    "/rest/api/3/search/jql": { isLast: true, issues: [] },
  };
  const redirectTarget = await server((_req, res) => res.end("{}"));
  const service = await server((req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path.endsWith("/APP-2")) {
      res.writeHead(302, { location: redirectTarget.origin });
      return res.end();
    }
    if (req.method === "GET") {
      return res.end(JSON.stringify(fixtures[path]));
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
      writes.push({ body, method: req.method, path });
      if (path.endsWith("/comment")) {
        if (writes.filter((write) => write.path === path).length > 1) {
          req.socket.destroy();
          return;
        }
        res.writeHead(201);
        res.end(JSON.stringify({ id: "5" }));
      } else if (path.endsWith("/issue")) {
        res.writeHead(201);
        res.end(JSON.stringify({ id: "42", key: "APP-1" }));
      } else {
        res.writeHead(204);
        res.end();
      }
    });
  });
  const jira = createJiraTool({
    jira: {
      credentialFile,
      email: "tester@example.test",
      site: service.origin,
    },
  });
  const context = { hasUI: true, ui: { confirm: () => Promise.resolve(true) } };
  const execute = (input: unknown) =>
    jira.execute("fixture", input, undefined, undefined, context);
  const get = await execute({
    action: "get",
    fields: ["summary"],
    key: "APP-1",
  });
  expect(get.details).toMatchObject({
    data: { summary: "visible [REDACTED]" },
    status: "ok",
  });
  expect(JSON.stringify(get)).not.toContain("fixture-jira-token");
  await expect(
    execute({ action: "search", project: "APP", query: "status = Open" })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  await expect(
    execute({
      action: "create",
      issue_type: "Bug",
      project: "APP",
      summary: "New",
    })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  await expect(
    execute({
      action: "update",
      fields: { Summary: "New" },
      key: "APP-1",
    })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  await expect(
    execute({ action: "comment", body: "A note", key: "APP-1" })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  await expect(
    execute({ action: "transition", key: "APP-1", transition: "9" })
  ).resolves.toMatchObject({ details: { status: "ok" } });
  await expect(execute({ action: "get", key: "APP-2" })).resolves.toMatchObject(
    {
      details: { status: "error" },
    }
  );
  expect(redirectTarget.requests).toHaveLength(0);
  await expect(
    execute({ action: "comment", body: "A second note", key: "APP-1" })
  ).resolves.toMatchObject({ details: { status: "indeterminate" } });
  const enter = Promise.withResolvers<boolean>();
  const approval = Promise.withResolvers<boolean>();
  const pending = jira.execute(
    "first",
    { action: "comment", body: "Pending", key: "APP-1" },
    undefined,
    undefined,
    {
      hasUI: true,
      ui: {
        confirm: () => {
          enter.resolve(true);
          return approval.promise;
        },
      },
    }
  );
  await enter.promise;
  await expect(
    execute({
      action: "update",
      fields: { Summary: "Concurrent" },
      key: "APP-1",
    })
  ).resolves.toMatchObject({
    details: { error: { code: "WRITE_BUSY" }, status: "blocked" },
  });
  approval.resolve(false);
  await expect(pending).resolves.toMatchObject({
    details: { status: "blocked" },
  });
  expect(writes.map(({ method, path }) => [method, path])).toStrictEqual([
    ["POST", "/rest/api/3/issue"],
    ["PUT", "/rest/api/3/issue/APP-1"],
    ["POST", "/rest/api/3/issue/APP-1/comment"],
    ["POST", "/rest/api/3/issue/APP-1/transitions"],
    ["POST", "/rest/api/3/issue/APP-1/comment"],
  ]);
  expect(
    service.requests.every(
      ({ authorization }) =>
        authorization ===
        `Basic ${Buffer.from("tester@example.test:fixture-jira-token").toString(
          "base64"
        )}`
    )
  ).toBeTruthy();
});
