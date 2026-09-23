import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";

import { RepoMapService, type RepositoryFacts } from "../../lib/repo-map/core";
import {
  runWorktreeTool,
  WorktreeCommandService,
  WorktreeFileSystemService,
  WorktreeGitService,
  WorktreeMutationService,
  WorktreePathError,
  WorktreePortlessService,
  type WorktreeRecord,
  type WorktreeToolInput,
} from "../../lib/worktree/core";

const facts = (
  setupScript: string | undefined,
  worktreeRoot = "/tmp/worktrees",
) =>
  ({
    repositoryRoot: "/repo/example",
    deliveryPolicy: {
      kind: "none",
      verification: {
        kind: "focused-only",
        workspaceRoot: "/repo/example",
      },
    },
    testRunner: "none",
    checks: [],
    devModes: [],
    setupScript,
    authMode: undefined,
    portlessAppName: "example",
    worktreeRoot,
    portlessRoute: {
      protocol: "https",
      hostSuffix: ".localhost",
      appName: "example",
      url: "https://example.localhost",
    },
    repositories: [],
  }) satisfies RepositoryFacts;

const run = (
  input: WorktreeToolInput,
  options: {
    readonly facts: RepositoryFacts;
    readonly exists?: (path: string) => boolean;
    readonly records?: ReadonlyArray<WorktreeRecord>;
    readonly command?: (args: ReadonlyArray<string>) => void;
    readonly git?: (input: {
      readonly action: "create" | "list" | "remove";
      readonly value: string;
    }) => void;
  },
) => {
  const records: WorktreeRecord[] = [...(options.records ?? [])];
  const exists = (path: string): boolean =>
    (options.exists?.(path) ?? false) ||
    records.some((record) => record.path === path);
  return Effect.runPromise(
    runWorktreeTool(input).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(options.facts),
      }),
      Effect.provideService(WorktreeFileSystemService, {
        exists: ({ path }) => Effect.succeed(exists(path)),
      }),
      Effect.provideService(WorktreeGitService, {
        resolveRepositoryRoot: () => Effect.succeed("/repo/example"),
        createWorktree: ({ path, branch }) =>
          Effect.sync(() => {
            options.git?.({ action: "create", value: path });
            options.command?.(["create", branch, path]);
            records.push({ path, branch });
          }),
        listWorktrees: ({ root }) =>
          Effect.sync(() => {
            options.git?.({ action: "list", value: root });
            return records;
          }),
        removeWorktree: ({ path }) =>
          Effect.sync(() => {
            options.git?.({ action: "remove", value: path });
            options.command?.(["remove", path]);
          }),
      }),
      Effect.provideService(WorktreeCommandService, {
        run: ({ arguments_ }) =>
          Effect.sync(() => {
            options.command?.(arguments_);
            return { exitCode: 0, output: "" };
          }),
      }),
      Effect.provideService(WorktreePortlessService, {
        register: ({ name }) =>
          Effect.sync(() => options.command?.(["portless", name])),
      }),
      Effect.provideService(WorktreeMutationService, {
        run: ({ operation }) => operation,
      }),
    ),
  );
};

test("delegates setup script and portless without repository checks", async () => {
  const calls: string[][] = [];
  const result = await run(
    { action: "new", task: "CI-6600", cwd: "/repo/example" },
    {
      facts: facts("scripts/setup-worktree.sh"),
      command: (args) => calls.push([...args]),
    },
  );
  expect(result).toMatchObject({
    action: "new",
    verification: { passed: true, checks: [] },
  });
  expect(calls).toContainEqual([
    "/repo/example/scripts/setup-worktree.sh",
    "/tmp/worktrees/example/CI-6600",
  ]);
  expect(calls).toContainEqual([
    "create",
    "CI-6600",
    "/tmp/worktrees/example/CI-6600",
  ]);
  expect(calls).toContainEqual(["portless", "CI-6600.example"]);
  expect(
    calls.some((call) =>
      ["test", "lint", "types", "graphql", "fallow"].includes(call[0] ?? ""),
    ),
  ).toBe(false);
});

test("creates a contextual ticket branch at a slash-free task path", async () => {
  const calls: string[][] = [];
  const result = await run(
    {
      action: "new",
      task: "campaign-filter",
      branch: "feat/campaign-filter/CI-6861",
      cwd: "/repo/example",
    },
    {
      facts: facts("scripts/setup-worktree.sh"),
      command: (args) => calls.push([...args]),
    },
  );

  expect(calls).toContainEqual([
    "create",
    "feat/campaign-filter/CI-6861",
    "/tmp/worktrees/example/campaign-filter",
  ]);
  expect(result).toMatchObject({
    action: "new",
    task: "campaign-filter",
    path: "/tmp/worktrees/example/campaign-filter",
    branch: "feat/campaign-filter/CI-6861",
  });
});

test("rejects a contextual branch for another ticket", async () => {
  await expect(
    run(
      {
        action: "new",
        task: "campaign-filter-CI-6861",
        branch: "feat/campaign-filter/CI-7000",
        cwd: "/repo/example",
      },
      { facts: facts(undefined) },
    ),
  ).rejects.toBeInstanceOf(WorktreePathError);
});

test("installs dependencies when no repository setup script is mapped", async () => {
  const calls: string[][] = [];
  const result = await run(
    { action: "new", task: "fallback", cwd: "/repo/example" },
    {
      facts: facts(undefined),
      exists: (path) => path.endsWith("/package.json"),
      command: (args) => calls.push([...args]),
    },
  );
  expect(result).toMatchObject({ verification: { passed: true, checks: [] } });
  expect(calls).toContainEqual(["install", "--frozen-lockfile"]);
  expect(calls).toContainEqual(["run", "--if-present", "setup"]);
  expect(calls.some((call) => call.includes("status"))).toBe(false);
});

test("uses the minimal Git fallback when no package manifest exists", async () => {
  const calls: string[][] = [];
  await run(
    { action: "new", task: "git-only", cwd: "/repo/example" },
    { facts: facts(undefined), command: (args) => calls.push([...args]) },
  );
  expect(calls).toContainEqual([
    "-C",
    "/tmp/worktrees/example/git-only",
    "status",
    "--short",
  ]);
});

test("verify targets the registered worktree for the requested task", async () => {
  const result = await run(
    { action: "verify", task: "CI-6600", cwd: "/repo/example" },
    {
      facts: facts(undefined),
      exists: (path) => path === "/tmp/worktrees/example/CI-6600",
      records: [{ path: "/tmp/worktrees/example/CI-6600", branch: "CI-6600" }],
    },
  );
  expect(result).toEqual({
    action: "verify",
    task: "CI-6600",
    path: "/tmp/worktrees/example/CI-6600",
    branch: "CI-6600",
    verification: { passed: true, checks: [] },
  });
});

test("lists only recognized worktrees under configured root", async () => {
  const result = await run(
    { action: "list", cwd: "/repo/example" },
    {
      facts: facts(undefined),
      records: [
        { path: "/tmp/worktrees/example/one", branch: "one" },
        { path: "/tmp/outside" },
      ],
    },
  );
  expect(result).toMatchObject({
    action: "list",
    root: "/tmp/worktrees",
    worktrees: [
      { path: "/tmp/worktrees/example/one" },
      { path: "/tmp/outside" },
    ],
  });
});

test("removes only a recognized worktree and refuses outside paths", async () => {
  const calls: string[][] = [];
  const result = await run(
    { action: "rm", task: "one", cwd: "/repo/example" },
    {
      facts: facts(undefined),
      records: [{ path: "/tmp/worktrees/example/one", branch: "one" }],
      command: (args) => calls.push([...args]),
    },
  );
  expect(result).toMatchObject({
    action: "rm",
    path: "/tmp/worktrees/example/one",
  });
  expect(calls).toContainEqual(["remove", "/tmp/worktrees/example/one"]);

  await expect(
    run(
      { action: "rm", task: "../outside", cwd: "/repo/example" },
      { facts: facts(undefined) },
    ),
  ).rejects.toBeInstanceOf(WorktreePathError);
});

test("expands tilde roots before Git calls and results", async () => {
  const root = `${homedir()}/.pi/worktrees`;
  const calls: Array<{
    readonly action: "create" | "list" | "remove";
    readonly value: string;
  }> = [];
  const result = await run(
    { action: "new", task: "tilde", cwd: "/repo/example" },
    {
      facts: facts(undefined, "~/.pi/worktrees"),
      git: (call) => calls.push(call),
    },
  );
  expect(result).toMatchObject({
    action: "new",
    path: `${root}/example/tilde`,
  });
  expect(calls).toContainEqual({
    action: "create",
    value: `${root}/example/tilde`,
  });
  expect(calls.some(({ value }) => value.includes("~"))).toBe(false);
  const homeCalls: Array<{
    readonly action: "create" | "list" | "remove";
    readonly value: string;
  }> = [];
  const homeResult = await run(
    { action: "list", cwd: "/repo/example" },
    { facts: facts(undefined, "~"), git: (call) => homeCalls.push(call) },
  );
  expect(homeResult).toMatchObject({ action: "list", root: homedir() });
  expect(homeCalls).toContainEqual({ action: "list", value: homedir() });
  expect(homeCalls.some(({ value }) => value.includes("~"))).toBe(false);
});

test("rejects malformed relative roots before Git operations", async () => {
  const calls: Array<{
    readonly action: "create" | "list" | "remove";
    readonly value: string;
  }> = [];
  await expect(
    run(
      { action: "list", cwd: "/repo/example" },
      {
        facts: facts(undefined, "relative/worktrees"),
        git: (call) => calls.push(call),
      },
    ),
  ).rejects.toBeInstanceOf(WorktreePathError);
  expect(calls).toHaveLength(0);
});

test("verifies a throwaway temporary task worktree without home state", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "worktree-test-"));
  const worktreePath = join(temporaryRoot, "example", "temporary");
  try {
    const result = await run(
      { action: "verify", task: "temporary", cwd: "/repo/example" },
      {
        facts: facts(undefined, temporaryRoot),
        exists: (path) => path === worktreePath,
        records: [{ path: worktreePath, branch: "temporary" }],
      },
    );
    expect(result).toMatchObject({
      action: "verify",
      task: "temporary",
      path: worktreePath,
      branch: "temporary",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
