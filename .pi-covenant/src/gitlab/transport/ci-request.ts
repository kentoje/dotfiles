import { Schema } from "effect";

/** GitLab identifiers must survive JSON and URL conversion without rounding. */
export const gitlabId = Schema.Int.check(
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
);
const project = { projectId: gitlabId };
const page = {
  page: gitlabId,
  pageSize: Schema.Int.check(
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(100)
  ),
  ...project,
};
const pipeline = { pipelineId: gitlabId, ...project };
const job = { jobId: gitlabId, ...project };

/** Closed transport request vocabulary. No caller supplies URLs or HTTP methods. */
export const gitlabCiRequest = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("pipelines"),
    ...page,
    ref: Schema.optionalKey(Schema.NonEmptyString),
    sha: Schema.optionalKey(Schema.NonEmptyString),
    state: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({ kind: Schema.Literal("pipeline"), ...pipeline }),
  Schema.Struct({
    kind: Schema.Literal("jobs"),
    ...pipeline,
    ...page,
    includeRetried: Schema.Boolean,
  }),
  Schema.Struct({ kind: Schema.Literal("job"), ...job }),
  Schema.Struct({
    kind: Schema.Literal("logs"),
    ...job,
    maxBytes: Schema.Int.check(
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(1_048_576)
    ),
    offset: Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(0),
      Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
    ),
  }),
  Schema.Struct({
    kind: Schema.Literal("mergeRequests"),
    ...page,
    branch: Schema.NonEmptyString,
  }),
  Schema.Struct({ kind: Schema.Literals(["retry", "cancel"]), ...pipeline }),
]);
/** Only these requests can reach the credential-bearing transport. */
export type GitlabCiRequest = typeof gitlabCiRequest.Type;
/** An authority decision is scoped to exactly one invocation and concrete target. */
export interface GitlabMutationTarget {
  readonly action: "retry" | "cancel";
  readonly host: string;
  readonly repository: string;
  readonly projectId: number;
  readonly pipelineId: number;
}
