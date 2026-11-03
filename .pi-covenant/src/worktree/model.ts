import { Schema } from "effect";

// oxlint-disable-next-line unicorn/throw-new-error -- Effect TaggedError is a superclass factory, not an error instance.
export class WorktreeFailure extends Schema.TaggedError<WorktreeFailure>()(
  "WorktreeFailure",
  {
    code: Schema.String,
    message: Schema.String,
  }
) {}

const contextFields = {
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.NonEmptyString),
};
export const WorktreeNewInput = Schema.Struct({
  ...contextFields,
  base: Schema.optionalKey(Schema.NonEmptyString),
  branch: Schema.optionalKey(Schema.NonEmptyString),
  task: Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u)
  ),
});
export const WorktreePathInput = Schema.Struct({
  ...contextFields,
  path: Schema.NonEmptyString,
});
export const WorktreeListInput = Schema.Struct(contextFields);
export type WorktreeNewRequest = typeof WorktreeNewInput.Type;

export type WorktreeSetup =
  | { readonly kind: "none" }
  | {
      readonly kind: "after-create" | "creates-worktree";
      readonly command: string;
      readonly args: readonly string[];
    };
/** Trusted resolved repository context supplied by the composition root, never model approval flags. */
export interface WorktreeHost {
  readonly repositoryPath: string;
  readonly repositoryId: string;
  readonly sessionCwd: string;
  readonly root?: string;
  readonly defaultBase?: string;
  readonly setup: WorktreeSetup;
  readonly requiredArtifacts: readonly string[];
}
/** An inherited absolute deadline and cancellation signal belong to this invocation. */
export interface WorktreeInvocation {
  readonly deadline?: number;
  readonly signal?: AbortSignal;
}
export interface WorktreeRecord {
  path: string;
  branch: string | null;
  head_sha: string;
  readiness: "ready" | "not_configured" | "setup_failed" | "unavailable";
  setup_completed?: boolean;
}
export interface WorktreeEffectRecord {
  phase: string;
  target: string;
  outcome: "committed" | "unknown";
  reference?: string | null;
}
export type WorktreeResult<T> = {
  context: { repository: string; repository_path: string };
  warnings: string[];
  completed_effects: WorktreeEffectRecord[];
} & (
  | { status: "ok"; data: T; error: null }
  | {
      status: "partial" | "blocked" | "error" | "cancelled" | "indeterminate";
      data: T | null;
      error: { code: string; message: string; phase: string; retryable: false };
    }
);
export const worktreeFailure = (code: string, message: string) =>
  new WorktreeFailure({ code, message });
export interface WorktreeProgress {
  record: WorktreeRecord | null;
  removal: WorktreeRemoval | null;
  effects: WorktreeEffectRecord[];
  cleanupFailed: boolean;
  phase: string;
  warnings: string[];
}
export interface WorktreeRemoval {
  path: string;
  removed: boolean;
  branch_deleted: boolean;
}
