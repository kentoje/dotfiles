import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  TicketBindingMalformedError,
  TicketBindingMissingError,
  TicketKeyValidationError,
  TicketWorktreeDeletedError,
} from "../../lib/ticket/core";
import {
  TicketLiveLayerWithOperations,
  type TicketStateOperations,
} from "../../lib/ticket/live";
import { runTicket } from "./core";

const makeState = () => {
  const files = new Map<string, string>();
  const directories = new Set<string>();
  const branches = new Map<string, string>();
  const operations: TicketStateOperations = {
    pathExists: (path) =>
      Effect.succeed(directories.has(path) || files.has(path)),
    readText: (path) => {
      const value = files.get(path);
      return value === undefined
        ? Effect.fail(new Error("not found"))
        : Effect.succeed(value);
    },
    writeText: (path, content) => {
      files.set(path, content);
      return Effect.succeed(undefined);
    },
    currentBranch: (cwd) => {
      const branch = branches.get(cwd);
      return branch === undefined
        ? Effect.fail(new Error("branch not found"))
        : Effect.succeed(branch);
    },
  };
  return { files, directories, branches, operations };
};

const run = (
  input: Parameters<typeof runTicket>[0],
  operations: TicketStateOperations,
) =>
  Effect.runPromise(
    runTicket(input).pipe(
      Effect.provide(TicketLiveLayerWithOperations(operations)),
    ),
  );

const runExit = (
  input: Parameters<typeof runTicket>[0],
  operations: TicketStateOperations,
) =>
  Effect.runPromiseExit(
    runTicket(input).pipe(
      Effect.provide(TicketLiveLayerWithOperations(operations)),
    ),
  );

test("bind validates, resolves branch, and writes a worktree association", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");
  state.branches.set("/worktrees/one", "feature/CI-6600-button");

  const result = await run(
    { input: { action: "bind", key: "CI-6600" }, cwd: "/worktrees/one" },
    state.operations,
  );

  expect(result.binding).toEqual({
    ticketKey: "CI-6600",
    branch: "feature/CI-6600-button",
    worktree: "/worktrees/one",
  });
  expect(
    JSON.parse(state.files.get("/worktrees/one/.dev-flow.json") ?? "{}"),
  ).toEqual({
    ticket: { key: "CI-6600" },
    branch: "feature/CI-6600-button",
    worktree: "/worktrees/one",
  });
});

test("current looks up the binding for the requested worktree", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");
  state.files.set(
    "/worktrees/one/.dev-flow.json",
    JSON.stringify({
      ticket: { key: "DS-61" },
      branch: "feature/DS-61-card",
      worktree: "/worktrees/one",
    }),
  );

  await expect(
    run(
      { input: { action: "current" }, cwd: "/worktrees/one" },
      state.operations,
    ),
  ).resolves.toEqual({
    action: "current",
    binding: {
      ticketKey: "DS-61",
      branch: "feature/DS-61-card",
      worktree: "/worktrees/one",
    },
  });
});

test("current reports missing binding", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");

  const exit = await runExit(
    { input: { action: "current" }, cwd: "/worktrees/one" },
    state.operations,
  );
  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(TicketBindingMissingError.name);
});

test("current reports malformed binding state", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");
  state.files.set("/worktrees/one/.dev-flow.json", "{not-json");

  const exit = await runExit(
    { input: { action: "current" }, cwd: "/worktrees/one" },
    state.operations,
  );
  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(TicketBindingMalformedError.name);
});

test("bind and current report a deleted worktree", async () => {
  const state = makeState();
  const exit = await runExit(
    { input: { action: "bind", key: "CI-6600" }, cwd: "/worktrees/deleted" },
    state.operations,
  );
  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(TicketWorktreeDeletedError.name);
});

test("bind rejects an invalid Jira-style ticket key", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");
  state.branches.set("/worktrees/one", "feature/no-ticket");

  const exit = await runExit(
    { input: { action: "bind", key: "not-a-ticket" }, cwd: "/worktrees/one" },
    state.operations,
  );
  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(TicketKeyValidationError.name);
});

test("current cannot leak a binding from another worktree", async () => {
  const state = makeState();
  state.directories.add("/worktrees/one");
  state.directories.add("/worktrees/two");
  state.files.set(
    "/worktrees/one/.dev-flow.json",
    JSON.stringify({
      ticket: { key: "CI-6600" },
      branch: "feature/CI-6600",
      worktree: "/worktrees/one",
    }),
  );

  const exit = await runExit(
    { input: { action: "current" }, cwd: "/worktrees/two" },
    state.operations,
  );
  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(TicketBindingMissingError.name);
});
