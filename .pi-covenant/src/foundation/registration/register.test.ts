import { contractTest } from "@covenant/vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { expect } from "vitest";

import { registerPiHarness, createPiHarnessTools } from "../module-port.js";
import { installPiFixtures } from "../testing/fixture.js";

const fixture = installPiFixtures();
contractTest("foundation.registration", () => {
  const names: string[] = [];
  const snippets: string[] = [];
  const host: Pick<ExtensionAPI, "registerTool"> = {
    registerTool(tool) {
      names.push(tool.name);
      snippets.push(tool.promptSnippet ?? "");
    },
  };
  registerPiHarness(host);
  expect(names).toStrictEqual(["project_cli", "worktree"]);
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
