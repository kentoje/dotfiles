import { Context, type Effect, Schema } from "effect";

/** A GitLab merge request pipeline state returned by the read-only MR boundary. */
export type MergeRequestPipelineState =
  | "created"
  | "waiting_for_resource"
  | "preparing"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "canceled"
  | "skipped"
  | "manual"
  | "scheduled"
  | "unknown";

/** A merge request status snapshot, including repository-bound ticket metadata. */
export interface MergeRequestStatus {
  readonly iid: number;
  readonly title: string;
  readonly draft: boolean;
  readonly discussionsOk: boolean;
  readonly pipelineState: MergeRequestPipelineState;
  readonly unresolvedCount: number;
  readonly boundTicket: string | undefined;
}

/** A merge request discussion thread with human/bot review metadata. */
export interface MergeRequestThread {
  readonly id: string;
  readonly author: string;
  readonly isBot: boolean;
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly body: string;
  readonly resolved: boolean;
}

/** A title/description pair derived from the branch commits. */
export interface MergeRequestUpdateData {
  readonly title: string;
  readonly description: string;
}

/** A current-branch commit used to derive merge request update data. */
export interface MergeRequestCommit {
  readonly subject: string;
  readonly body: string;
}

/** A successful reply mutation, including the resulting resolution state. */
export interface MergeRequestReplyResult {
  readonly threadId: string;
  readonly resolved: boolean;
}

/** A successful merge request update mutation. */
export interface MergeRequestUpdateResult extends MergeRequestUpdateData {
  readonly iid: number;
}

/** A successful pipeline watch result. */
export interface MergeRequestPipelineSettled {
  readonly iid: number;
  readonly state: MergeRequestPipelineState;
}

/** Failure while querying or mutating GitLab merge request state. */
export class MergeRequestGitLabError extends Schema.TaggedError<MergeRequestGitLabError>()(
  "MergeRequestGitLabError",
  { message: Schema.String },
) {}

/** Failure while reading commits used by merge request update. */
export class MergeRequestCommitError extends Schema.TaggedError<MergeRequestCommitError>()(
  "MergeRequestCommitError",
  { message: Schema.String },
) {}

/** GitLab operations for an existing merge request, kept behind an Effect service seam. */
export class MergeRequestService extends Context.Service<
  MergeRequestService,
  {
    readonly statusFor: (input: {
      readonly cwd: string;
    }) => Effect.Effect<MergeRequestStatus, MergeRequestGitLabError>;
    readonly threadsFor: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      ReadonlyArray<MergeRequestThread>,
      MergeRequestGitLabError
    >;
    readonly replyTo: (input: {
      readonly cwd: string;
      readonly threadId: string;
      readonly body: string;
      readonly resolve: boolean;
    }) => Effect.Effect<MergeRequestReplyResult, MergeRequestGitLabError>;
    readonly updateWith: (input: {
      readonly cwd: string;
      readonly title: string;
      readonly description: string;
    }) => Effect.Effect<MergeRequestUpdateResult, MergeRequestGitLabError>;
    readonly pipelineFor: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      | MergeRequestPipelineSettled
      | { readonly iid: number; readonly state: MergeRequestPipelineState },
      MergeRequestGitLabError
    >;
  }
>()("pi-custom-harness/lib/mr/MergeRequestService") {}

/** Alias used by callers that name the transport after GitLab rather than the tool. */
export const GitLabMergeRequestService = MergeRequestService;

/** Commit operations used to regenerate title and description, kept behind an Effect seam. */
export class MergeRequestCommitService extends Context.Service<
  MergeRequestCommitService,
  {
    readonly currentBranchCommits: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      ReadonlyArray<MergeRequestCommit>,
      MergeRequestCommitError
    >;
  }
>()("pi-custom-harness/lib/mr/MergeRequestCommitService") {}

/** A clock seam used by deterministic watch tests. */
export class MergeRequestClock extends Context.Service<
  MergeRequestClock,
  {
    readonly currentTimeMillis: Effect.Effect<number>;
  }
>()("pi-custom-harness/lib/mr/MergeRequestClock") {}

/** A timer seam used by pipeline polling; Pi-specific timer APIs stay at index.ts. */
export class MergeRequestTimer extends Context.Service<
  MergeRequestTimer,
  {
    readonly sleep: (milliseconds: number) => Effect.Effect<void>;
  }
>()("pi-custom-harness/lib/mr/MergeRequestTimer") {}

/** Returns true only for pipeline states that no longer need polling. */
export const isMergeRequestPipelineSettled = (
  state: MergeRequestPipelineState,
): boolean =>
  state === "success" ||
  state === "failed" ||
  state === "canceled" ||
  state === "skipped" ||
  state === "manual";
