import { unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect } from "vitest";

import { registerPiHarness, createPiHarnessTools } from "../module-port.js";
import { installPiFixtures } from "../testing/fixture.js";

const fixture = installPiFixtures();
contractTest("foundation.registration", () => {
  const names: string[] = [];
  const snippets: string[] = [];
  const host: Pick<ExtensionAPI, "registerTool"> &
    Partial<Pick<ExtensionAPI, "on">> = {
    on() {
      throw new Error("Default registration must not install an event hook");
    },
    registerTool(tool) {
      names.push(tool.name);
      snippets.push(tool.promptSnippet ?? "");
    },
  };
  registerPiHarness(host);
  expect(names).toStrictEqual([
    "project_cli",
    "worktree",
    "gitlab",
    "jira",
    "mr",
    "fleet",
  ]);
  expect(snippets.every((snippet) => snippet.length > 0)).toBeTruthy();
});
contractTest("foundation.boundary", async () => {
  const f = await fixture();
  const [project, worktree] = createPiHarnessTools({ configPath: f.config });
  const inspected = await project.execute(
    "inspect",
    { action: "inspect" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(inspected.isError).toBeFalsy();
  expect(inspected.details).toMatchObject({ project: f.repo });
  const invalid = await worktree.execute(
    "new",
    { action: "new", approval: true, task: "safe" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(invalid.isError).toBeTruthy();
  expect(f.git(["worktree", "list", "--porcelain"]).toString()).not.toContain(
    "safe"
  );
  const bad = await project.execute(
    "inspect",
    { action: "inspect", keep_going: true },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(bad.isError).toBeTruthy();
});

contractTest("foundation.project-profile-approval", async () => {
  const f = await fixture();
  await writeFile(
    join(f.repo, "package.json"),
    JSON.stringify({ scripts: { test: "node --version" } })
  );
  await unlink(join(f.repo, "project-checks.json"));
  const [project] = createPiHarnessTools();
  const proposed = await project.execute(
    "profile-propose",
    { action: "propose" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(proposed.isError, JSON.stringify(proposed.details)).toBeFalsy();
  expect(proposed.details).toHaveProperty("proposal_id");
  const proposalDetails = proposed.details as { proposal_id: string };
  const input = { action: "create", proposal_id: proposalDetails.proposal_id };
  const denied = await project.execute(
    "profile-create",
    input,
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(denied.isError).toBeTruthy();
  const accepted = await project.execute(
    "profile-create",
    input,
    undefined,
    undefined,
    {
      cwd: f.repo,
      hasUI: true,
      ui: {
        confirm: (_title, details) => {
          expect(JSON.parse(details)).toMatchObject({
            path: "project-checks.json",
            project: f.repo,
            proposal_id: input.proposal_id,
          });
          return Promise.resolve(true);
        },
      },
    }
  );
  expect(accepted.details).toMatchObject({ state: "saved" });
});

contractTest("foundation.project-check-progress", async () => {
  const f = await fixture();
  const [project] = createPiHarnessTools();
  const updates: unknown[] = [];
  const controller = new AbortController();
  await f.write("project-checks.json", {
    checks: [
      { args: ["--version"], command: process.execPath, id: "first" },
      { args: ["--version"], command: process.execPath, id: "second" },
    ],
  });
  const result = await project.execute(
    "check",
    { action: "check" },
    controller.signal,
    ({ details }) => {
      updates.push(details);
      if (JSON.stringify(details).includes('"stage":"check_finished"')) {
        controller.abort();
      }
    },
    { cwd: f.repo }
  );
  expect(updates.slice(-2)).toMatchObject([
    { check_id: "first", index: 1, stage: "check_started", total: 2 },
    { check_id: "first", stage: "check_finished", status: "passed" },
  ]);
  expect(result.details).toMatchObject({
    checks: [{ status: "passed" }, { status: "not_run" }],
    outcome: "cancelled",
  });
});

contractTest("foundation.optional-capability-approval", async () => {
  const f = await fixture();
  const [project] = createPiHarnessTools();
  await f.write("project-capabilities.json", {
    capabilities: [
      {
        args: ["-e", "console.log('http://localhost:4321')"],
        command: process.execPath,
        id: "preview:url",
      },
    ],
  });
  const input = {
    action: "execute_capability",
    arguments: [],
    capability_id: "preview:url",
  };
  const withoutUI = await project.execute(
    "capability",
    input,
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(withoutUI.details).toMatchObject({ outcome: "blocked" });
  const withUI = await project.execute(
    "capability",
    input,
    undefined,
    undefined,
    {
      cwd: f.repo,
      hasUI: true,
      ui: {
        confirm: (_title, details) => {
          expect(JSON.parse(details)).toMatchObject({
            project: f.repo,
            spec: { command: process.execPath, id: "preview:url" },
          });
          return Promise.resolve(true);
        },
      },
    }
  );
  expect(withUI.details).toMatchObject({
    outcome: "pass",
    result: { stdout: "http://localhost:4321\n" },
  });
});
