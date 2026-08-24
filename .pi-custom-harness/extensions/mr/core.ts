import { Effect } from "effect";

import {
  isMergeRequestPipelineSettled,
  MergeRequestClock,
  type MergeRequestCommit,
  type MergeRequestCommitError,
  MergeRequestCommitService,
  MergeRequestGitLabError,
  type MergeRequestPipelineSettled,
  type MergeRequestReplyResult,
  MergeRequestService,
  type MergeRequestStatus,
  type MergeRequestThread,
  MergeRequestTimer,
  type MergeRequestUpdateData,
  type MergeRequestUpdateResult,
} from "../../lib/mr/core";
import type { MergeRequestInput as SchemaMergeRequestInput } from "./schema";

/** Input to one Pi-free merge request action, with cwd supplied by the boundary. */
export interface MergeRequestActionInput {
  readonly cwd: string;
  readonly request: SchemaMergeRequestInput;
}

/** Observable result of a merge request action. */
export type MergeRequestActionResult =
  | { readonly action: "status"; readonly status: MergeRequestStatus }
  | {
      readonly action: "threads";
      readonly threads: ReadonlyArray<MergeRequestThread>;
    }
  | { readonly action: "reply"; readonly reply: MergeRequestReplyResult }
  | { readonly action: "update"; readonly update: MergeRequestUpdateResult }
  | { readonly action: "watch"; readonly settled: MergeRequestPipelineSettled };

/** A successful polling result that identifies the terminal pipeline state. */
export interface MergeRequestWatchOptions {
  readonly intervalMs: number;
}

/** Derives title and description from commits without reading package metadata. */
export const deriveMergeRequestUpdateData = (
  commits: ReadonlyArray<MergeRequestCommit>,
): MergeRequestUpdateData => {
  const firstCommit = commits[0];
  const title = firstCommit?.subject.trim() || "Update merge request";
  const description = commits
    .map((commit) => {
      const subject = commit.subject.trim();
      const body = commit.body.trim();
      return body.length === 0 ? subject : `${subject}\n\n${body}`;
    })
    .filter((commit) => commit.length > 0)
    .join("\n\n");
  return { title, description };
};

/** Runs status, threads, reply, or commit-derived update through fakeable Effect services. */
export const runMergeRequestAction = Effect.fn("runMergeRequestAction")(
  function* ({
    cwd,
    request,
  }: MergeRequestActionInput): Effect.fn.Return<
    MergeRequestActionResult,
    MergeRequestCommitError | MergeRequestGitLabError,
    | MergeRequestCommitService
    | MergeRequestService
    | MergeRequestClock
    | MergeRequestTimer
  > {
    const mergeRequestService = yield* MergeRequestService;

    switch (request.action) {
      case "status":
        return {
          action: "status",
          status: yield* mergeRequestService.statusFor({ cwd }),
        } as const;
      case "threads":
        return {
          action: "threads",
          threads: yield* mergeRequestService.threadsFor({ cwd }),
        } as const;
      case "reply": {
        const threadId = request.threadId;
        const body = request.body;
        if (threadId === undefined || body === undefined) {
          return yield* new MergeRequestGitLabError({
            message: "MR reply requires threadId and body.",
          });
        }
        return {
          action: "reply",
          reply: yield* mergeRequestService.replyTo({
            cwd,
            threadId,
            body,
            resolve: request.resolve ?? false,
          }),
        } as const;
      }
      case "update": {
        const commitService = yield* MergeRequestCommitService;
        const commits = yield* commitService.currentBranchCommits({ cwd });
        const updateData = deriveMergeRequestUpdateData(commits);
        return {
          action: "update",
          update: yield* mergeRequestService.updateWith({
            cwd,
            ...updateData,
          }),
        } as const;
      }
      case "watch":
        return yield* watchMergeRequestPipeline({
          cwd,
          intervalMs: request.intervalMs ?? 30_000,
        });
      default: {
        const exhaustive: never = request.action;
        return exhaustive;
      }
    }
  },
);

/** Polls an existing merge request until its pipeline is terminal; interruption cancels the poll. */
export const watchMergeRequestPipeline = Effect.fn("watchMergeRequestPipeline")(
  function* ({
    cwd,
    intervalMs,
  }: {
    readonly cwd: string;
    readonly intervalMs: number;
  }) {
    const mergeRequestService = yield* MergeRequestService;
    const timer = yield* MergeRequestTimer;
    const clock = yield* MergeRequestClock;

    yield* clock.currentTimeMillis;
    while (true) {
      const pipeline = yield* mergeRequestService.pipelineFor({ cwd });
      if (isMergeRequestPipelineSettled(pipeline.state)) {
        return {
          action: "watch",
          settled: {
            iid: pipeline.iid,
            state: pipeline.state,
          },
        } as const;
      }
      yield* timer.sleep(intervalMs);
      yield* clock.currentTimeMillis;
    }
  },
);

/** Builds a deterministic live clock service from Effect's default clock. */
export const liveMergeRequestClock = MergeRequestClock.of({
  currentTimeMillis: Effect.clockWith((clock) => clock.currentTimeMillis),
});

/** Builds the default timer service; callers replace it with fake sleeps in core tests. */
export const liveMergeRequestTimer = MergeRequestTimer.of({
  sleep: (milliseconds) => Effect.sleep(milliseconds),
});

/** Re-exported input alias for consumers that import the action core directly. */
export type MergeRequestActionRequest = SchemaMergeRequestInput;
