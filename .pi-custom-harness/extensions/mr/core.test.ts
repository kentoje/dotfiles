import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  MergeRequestClock,
  MergeRequestCommitService,
  MergeRequestService,
  MergeRequestTimer,
} from "../../lib/mr/core";
import { deriveMergeRequestUpdateData, runMergeRequestAction } from "./core";

const unusedCommitService = MergeRequestCommitService.of({
  currentBranchCommits: () => Effect.die("commit lookup should not run"),
});

const unusedClock = MergeRequestClock.of({
  currentTimeMillis: Effect.succeed(0),
});

const unusedTimer = MergeRequestTimer.of({
  sleep: () => Effect.succeed(undefined),
});

test("status returns the complete MR snapshot", async () => {
  const result = await Effect.runPromise(
    runMergeRequestAction({
      cwd: "/workspace",
      request: { action: "status" },
    }).pipe(
      Effect.provideService(MergeRequestService, {
        statusFor: () =>
          Effect.succeed({
            iid: 17,
            title: "Improve review flow",
            draft: true,
            discussionsOk: false,
            pipelineState: "running",
            unresolvedCount: 2,
            boundTicket: "APP-17",
          }),
        threadsFor: () => Effect.die("threads should not run"),
        replyTo: () => Effect.die("reply should not run"),
        updateWith: () => Effect.die("update should not run"),
        pipelineFor: () => Effect.die("watch should not run"),
      }),
      Effect.provideService(MergeRequestCommitService, unusedCommitService),
      Effect.provideService(MergeRequestClock, unusedClock),
      Effect.provideService(MergeRequestTimer, unusedTimer),
    ),
  );
  expect(result).toEqual({ action: "status", status: expect.any(Object) });
});

test("threads preserves human and bot metadata", async () => {
  const threads = [
    {
      id: "h1",
      author: "alice",
      isBot: false,
      file: "src/a.ts",
      line: 9,
      body: "Please simplify",
      resolved: false,
    },
    {
      id: "b1",
      author: "bugbot",
      isBot: true,
      file: undefined,
      line: undefined,
      body: "Potential issue",
      resolved: true,
    },
  ];
  const result = await Effect.runPromise(
    runMergeRequestAction({
      cwd: "/workspace",
      request: { action: "threads" },
    }).pipe(
      Effect.provideService(MergeRequestService, {
        statusFor: () => Effect.die("status should not run"),
        threadsFor: () => Effect.succeed(threads),
        replyTo: () => Effect.die("reply should not run"),
        updateWith: () => Effect.die("update should not run"),
        pipelineFor: () => Effect.die("watch should not run"),
      }),
      Effect.provideService(MergeRequestCommitService, unusedCommitService),
      Effect.provideService(MergeRequestClock, unusedClock),
      Effect.provideService(MergeRequestTimer, unusedTimer),
    ),
  );
  expect(result).toEqual({ action: "threads", threads });
});

test("reply passes optional resolution to GitLab", async () => {
  let received:
    | { threadId: string; body: string; resolve: boolean }
    | undefined;
  const result = await Effect.runPromise(
    runMergeRequestAction({
      cwd: "/workspace",
      request: {
        action: "reply",
        threadId: "t1",
        body: "Fixed",
        resolve: true,
      },
    }).pipe(
      Effect.provideService(MergeRequestService, {
        statusFor: () => Effect.die("status should not run"),
        threadsFor: () => Effect.die("threads should not run"),
        replyTo: ({ threadId, body, resolve }) => {
          received = { threadId, body, resolve };
          return Effect.succeed({ threadId, resolved: resolve });
        },
        updateWith: () => Effect.die("update should not run"),
        pipelineFor: () => Effect.die("watch should not run"),
      }),
      Effect.provideService(MergeRequestCommitService, unusedCommitService),
      Effect.provideService(MergeRequestClock, unusedClock),
      Effect.provideService(MergeRequestTimer, unusedTimer),
    ),
  );
  expect(received).toEqual({ threadId: "t1", body: "Fixed", resolve: true });
  expect(result).toEqual({
    action: "reply",
    reply: { threadId: "t1", resolved: true },
  });
});

test("update derives title and description from commits", async () => {
  let received: { title: string; description: string } | undefined;
  const result = await Effect.runPromise(
    runMergeRequestAction({
      cwd: "/workspace",
      request: { action: "update" },
    }).pipe(
      Effect.provideService(MergeRequestCommitService, {
        currentBranchCommits: () =>
          Effect.succeed([
            { subject: "Fix title", body: "First body" },
            { subject: "Add tests", body: "" },
          ]),
      }),
      Effect.provideService(MergeRequestService, {
        statusFor: () => Effect.die("status should not run"),
        threadsFor: () => Effect.die("threads should not run"),
        replyTo: () => Effect.die("reply should not run"),
        updateWith: ({ title, description }) => {
          received = { title, description };
          return Effect.succeed({ iid: 17, title, description });
        },
        pipelineFor: () => Effect.die("watch should not run"),
      }),
      Effect.provideService(MergeRequestClock, unusedClock),
      Effect.provideService(MergeRequestTimer, unusedTimer),
    ),
  );
  expect(received).toEqual({
    title: "Fix title",
    description: "Fix title\n\nFirst body\n\nAdd tests",
  });
  expect(result).toEqual({
    action: "update",
    update: {
      iid: 17,
      title: "Fix title",
      description: "Fix title\n\nFirst body\n\nAdd tests",
    },
  });
});

test("watch polls until a settled pipeline and uses the timer seam", async () => {
  let polls = 0;
  let sleeps = 0;
  const result = await Effect.runPromise(
    runMergeRequestAction({
      cwd: "/workspace",
      request: { action: "watch", intervalMs: 5 },
    }).pipe(
      Effect.provideService(MergeRequestClock, {
        currentTimeMillis: Effect.succeed(100),
      }),
      Effect.provideService(MergeRequestTimer, {
        sleep: (ms) =>
          Effect.sync(() => {
            sleeps += ms;
          }),
      }),
      Effect.provideService(MergeRequestService, {
        statusFor: () => Effect.die("status should not run"),
        threadsFor: () => Effect.die("threads should not run"),
        replyTo: () => Effect.die("reply should not run"),
        updateWith: () => Effect.die("update should not run"),
        pipelineFor: () =>
          Effect.sync(() => {
            polls += 1;
            return {
              iid: 17,
              state: polls === 1 ? ("running" as const) : ("failed" as const),
            };
          }),
      }),
      Effect.provideService(MergeRequestCommitService, unusedCommitService),
    ),
  );
  expect(result).toEqual({
    action: "watch",
    settled: { iid: 17, state: "failed" },
  });
  expect(sleeps).toBe(5);
});

test("update derivation has a safe empty-commit fallback", () => {
  expect(deriveMergeRequestUpdateData([])).toEqual({
    title: "Update merge request",
    description: "",
  });
});
