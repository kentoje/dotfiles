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
import { expect } from "vitest";

import { installPiFixtures } from "../testing/fixture.js";

const fixture = installPiFixtures();
contractTest("foundation.sdk", async () => {
  const f = await fixture();
  const loaded = await discoverAndLoadExtensions(
    [resolve("src/foundation/extension.ts")],
    f.repo,
    join(f.temp, "agent")
  );
  expect(loaded.errors).toStrictEqual([]);
  expect(loaded.extensions).toHaveLength(1);
  const [extension] = loaded.extensions;
  if (!extension) {
    throw new Error("PI_SDK_TEST: extension missing");
  }
  expect([...extension.tools.keys()]).toStrictEqual([
    "project_cli",
    "worktree",
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
      ])
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
