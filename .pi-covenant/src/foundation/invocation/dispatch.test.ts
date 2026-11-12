import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { createPiHarnessTools } from "../module-port.js";
import { installPiFixtures } from "../testing/fixture.js";

const fixture = installPiFixtures();
contractTest("foundation.lifecycle", async () => {
  const f = await fixture();
  const [tool] = createPiHarnessTools({ timeoutMs: 100 });
  const abort = new AbortController();
  abort.abort();
  const stopped = await tool.execute(
    "cancel",
    { action: "check" },
    abort.signal,
    undefined,
    { cwd: f.repo }
  );
  expect(stopped.isError).toBeTruthy();
  const between = new AbortController();
  const beforeDispatch = await tool.execute(
    "between",
    { action: "check" },
    between.signal,
    () => between.abort(),
    { cwd: f.repo }
  );
  expect(beforeDispatch.isError).toBeTruthy();
  const marker = join(f.repo, "started");
  await f.write("project-checks.json", {
    checks: [
      {
        args: [
          "-e",
          `require('fs').writeFileSync(${JSON.stringify(marker)},'yes');setInterval(()=>{},1000)`,
        ],
        command: process.execPath,
        id: "slow",
      },
      {
        args: ["-e", "require('fs').writeFileSync('later','bad')"],
        command: process.execPath,
        id: "later",
      },
    ],
  });
  const expired = await tool.execute(
    "deadline",
    { action: "check" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(expired.isError).toBeTruthy();
  expect(expired.details).toMatchObject({
    checks: [{ status: "timed_out" }, { status: "not_run" }],
    exit_code: 1,
  });
  await expect(access(join(f.repo, "later"))).rejects.toThrow(/ENOENT/u);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50);
  try {
    const cancelled = await tool.execute(
      "active",
      { action: "check" },
      controller.signal,
      undefined,
      { cwd: f.repo }
    );
    expect(cancelled.isError).toBeTruthy();
    expect(cancelled.details).toMatchObject({ exit_code: 130 });
  } finally {
    clearTimeout(timer);
  }
});
contractTest("foundation.results", async () => {
  const f = await fixture();
  await f.write("project-checks.json", {
    checks: [
      {
        args: ["-e", "process.exit(7)"],
        command: process.execPath,
        id: "broken",
      },
      {
        args: ["-e", "process.exit(0)"],
        command: process.execPath,
        id: "good",
      },
    ],
  });
  const [tool, worktree] = createPiHarnessTools({ configPath: f.config });
  const updates: unknown[] = [];
  const result = await tool.execute(
    "failure",
    { action: "check", keep_going: true },
    undefined,
    (update) => updates.push(update),
    { cwd: f.repo }
  );
  expect(result.isError).toBeTruthy();
  expect(result.content).toStrictEqual([
    expect.objectContaining({
      text: expect.stringContaining("broken: failed"),
    }),
  ]);
  expect(result.details).toMatchObject({
    checks: [
      { code: 7, id: "broken" },
      { code: 0, id: "good" },
    ],
    exit_code: 1,
  });
  expect(updates.length).toBeGreaterThan(1);
  const [projectConfig] = f.configValue.projects;
  if (!projectConfig) {
    throw new Error("PI_FIXTURE: missing configuration");
  }
  await writeFile(
    f.config,
    JSON.stringify({
      ...f.configValue,
      projects: [
        {
          ...projectConfig,
          worktree: {
            ...projectConfig.worktree,
            setup: {
              args: ["-e", "process.exit(9)"],
              command: process.execPath,
              kind: "after-create",
            },
          },
        },
      ],
    })
  );
  const partial = await worktree.execute(
    "partial",
    { action: "new", task: "partial" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(partial.isError).toBeTruthy();
  expect(partial.details).toMatchObject({
    completed_effects: expect.arrayContaining([
      expect.objectContaining({ outcome: "committed" }),
    ]),
    status: "partial",
  });
});
contractTest("foundation.configuration", async () => {
  const f = await fixture();
  const [, missing] = createPiHarnessTools();
  expect(
    (
      await missing.execute(
        "missing",
        { action: "new", task: "blocked" },
        undefined,
        undefined,
        { cwd: f.repo }
      )
    ).isError
  ).toBeTruthy();
  const [, worktree] = createPiHarnessTools({ configPath: f.config });
  const created = await worktree.execute(
    "new",
    { action: "new", task: "hello" },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(created.isError).toBeFalsy();
  expect(created.details).toMatchObject({ status: "ok" });
  const path = join(f.temp, "worktrees", "fixture", "hello");
  const verified = await worktree.execute(
    "verify",
    { action: "verify", path },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(verified.isError).toBeFalsy();
  const removed = await worktree.execute(
    "rm",
    { action: "rm", path },
    undefined,
    undefined,
    { cwd: f.repo }
  );
  expect(removed.isError).toBeFalsy();
  await expect(access(path)).rejects.toThrow(/ENOENT/u);
  expect(
    (
      await worktree.execute("list", { action: "list" }, undefined, undefined, {
        cwd: f.repo,
      })
    ).details
  ).toMatchObject({ status: "ok" });
  await writeFile(f.config, JSON.stringify({ approval: true, projects: [] }));
  expect(
    (
      await worktree.execute(
        "bad",
        { action: "new", task: "bad" },
        undefined,
        undefined,
        { cwd: f.repo }
      )
    ).isError
  ).toBeTruthy();
  expect(f.git(["worktree", "list", "--porcelain"]).toString()).not.toContain(
    "/bad"
  );
});
