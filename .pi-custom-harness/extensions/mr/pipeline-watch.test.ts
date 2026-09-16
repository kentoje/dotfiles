import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  type HarnessPipelineWatchCommandContext,
  type HarnessPipelineWatchRuntime,
  parseHarnessPipelineWatchArguments,
  registerHarnessPipelineWatchCommand,
} from "./pipeline-watch";

test("parses explicit worktree and polling interval", () => {
  expect(parseHarnessPipelineWatchArguments("/worktrees/task 5")).toEqual({
    worktree: "/worktrees/task",
    intervalMs: 5_000,
  });
  expect(parseHarnessPipelineWatchArguments("10")).toEqual({
    worktree: undefined,
    intervalMs: 10_000,
  });
});

test("registers harness-prefixed pipeline monitoring without triggering a model turn", async () => {
  let commandName = "";
  let handler:
    | ((
        args: string,
        context: HarnessPipelineWatchCommandContext,
      ) => Promise<void>)
    | undefined;
  let shutdown: (() => void) | undefined;
  const notifications: Array<{
    readonly message: string;
    readonly level: string;
  }> = [];
  const runtime: HarnessPipelineWatchRuntime = {
    watch: ({ cwd, intervalMs }) => {
      expect(cwd).toBe(process.cwd());
      expect(intervalMs).toBe(5_000);
      return Promise.resolve({
        action: "watch",
        settled: { iid: 42, state: "success" },
      });
    },
  };
  const pi = {
    registerCommand: (name: string, options: { handler: typeof handler }) => {
      commandName = name;
      handler = options.handler;
    },
    on: (event: string, callback: () => void) => {
      if (event === "session_shutdown") shutdown = callback;
    },
  } as unknown as ExtensionAPI;

  registerHarnessPipelineWatchCommand(pi, runtime);
  expect(commandName).toBe("harness-watch-pipeline");
  expect(handler).toBeDefined();
  if (handler === undefined) return;
  await handler("5", {
    cwd: process.cwd(),
    ui: {
      notify: (message: string, level: "info" | "error") => {
        notifications.push({ message, level });
      },
    },
  });
  await Promise.resolve();

  expect(notifications).toEqual([
    { message: "Pipeline watch started.", level: "info" },
    {
      message: "Pipeline for merge request !42 settled: success.",
      level: "info",
    },
  ]);
  expect(shutdown).toBeDefined();
});

test("session shutdown cancels an active pipeline watch without notifying settlement", async () => {
  let handler:
    | ((
        args: string,
        context: HarnessPipelineWatchCommandContext,
      ) => Promise<void>)
    | undefined;
  let shutdown: (() => void) | undefined;
  let watchSignal: AbortSignal | undefined;
  const notifications: string[] = [];
  const pendingWatch = Promise.withResolvers<never>();
  const runtime: HarnessPipelineWatchRuntime = {
    watch: ({ signal }) => {
      watchSignal = signal;
      return pendingWatch.promise;
    },
  };
  const pi = {
    registerCommand: (_name: string, options: { handler: typeof handler }) => {
      handler = options.handler;
    },
    on: (event: string, callback: () => void) => {
      if (event === "session_shutdown") shutdown = callback;
    },
  } as unknown as ExtensionAPI;

  registerHarnessPipelineWatchCommand(pi, runtime);
  if (handler === undefined || shutdown === undefined) return;
  await handler("", {
    cwd: process.cwd(),
    ui: {
      notify: (message: string) => {
        notifications.push(message);
      },
    },
  });
  shutdown();

  expect(watchSignal?.aborted).toBe(true);
  expect(notifications).toEqual(["Pipeline watch started."]);
});
