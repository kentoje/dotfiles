import { Effect, Schema } from "effect";

import type { GitlabTarget } from "../../repository-context/module-port.js";
import {
  decodeGitlabObservation,
  gitlabOperationRequest,
  requireGitlabReply,
} from "../invocation/operation.js";
import type { GitlabOperation } from "../invocation/operation.js";
import {
  decodeGitlabPage,
  gitlabPageQuery,
  validateGitlabCursor,
} from "../pagination/cursor.js";
import { gitlabId } from "../transport/ci-request.js";
import { decodeGitlabJob, decodeGitlabPipeline } from "./models.js";

const text = Schema.NonEmptyString;
const optionalText = Schema.optionalKey(text);
const context = { cwd: optionalText, repository: optionalText };
const pageSizeSchema = Schema.Int.check(
  Schema.isGreaterThan(0),
  Schema.isLessThanOrEqualTo(100)
);
const pageArgs = {
  cursor: optionalText,
  page_size: Schema.optionalKey(pageSizeSchema),
};
/** Strict action-specific input validation rejects extra control or credential fields. */
export const gitlabCiInputs = {
  cancel: Schema.Struct({
    ...context,
    pipeline_id: gitlabId,
    repository: text,
  }),
  job: Schema.Struct({ ...context, job_id: gitlabId }),
  jobs: Schema.Struct({
    ...context,
    ...pageArgs,
    include_retried: Schema.optionalKey(Schema.Boolean),
    pipeline_id: gitlabId,
  }),
  logs: Schema.Struct({
    ...context,
    job_id: gitlabId,
    max_bytes: Schema.optionalKey(
      Schema.Int.check(
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(1_048_576)
      )
    ),
    offset: Schema.optionalKey(
      Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(0),
        Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
      )
    ),
  }),
  lookup_open_mrs: Schema.Struct({ repository: text, source_branch: text }),
  pipeline: Schema.Struct({ ...context, pipeline_id: gitlabId }),
  pipelines: Schema.Struct({
    ...context,
    ...pageArgs,
    ref: optionalText,
    sha: optionalText,
    state: optionalText,
  }),
  retry: Schema.Struct({ ...context, pipeline_id: gitlabId, repository: text }),
};
function pipelineQueryIdentity(
  args: typeof gitlabCiInputs.pipelines.Type,
  target: GitlabTarget
) {
  return [
    target.host,
    target.project_path,
    "pipelines",
    args.page_size ?? 50,
    args.ref,
    args.sha,
    args.state,
  ];
}
function jobQueryIdentity(
  args: typeof gitlabCiInputs.jobs.Type,
  target: GitlabTarget
) {
  return [
    target.host,
    target.project_path,
    "jobs",
    args.pipeline_id,
    args.page_size ?? 50,
    args.include_retried ?? false,
  ];
}
/** Validate a pipeline continuation against local context before reading GitLab. */
export function checkPipelineCursor(
  args: typeof gitlabCiInputs.pipelines.Type,
  target: GitlabTarget
) {
  validateGitlabCursor(args.cursor, pipelineQueryIdentity(args, target));
}
/** Validate a job continuation against local context before reading GitLab. */
export function checkJobCursor(
  args: typeof gitlabCiInputs.jobs.Type,
  target: GitlabTarget
) {
  validateGitlabCursor(args.cursor, jobQueryIdentity(args, target));
}
/** Read and validate a pipeline selected by exact numeric ID. */
export const readGitlabPipeline = Effect.fn("readGitlabPipeline")(
  function* readGitlabPipeline(
    args: { pipeline_id: number },
    op: GitlabOperation
  ) {
    const projectId = op.context.project_id;
    const wire = yield* gitlabOperationRequest(op, {
      kind: "pipeline",
      pipelineId: args.pipeline_id,
      projectId,
    }).pipe(Effect.flatMap(requireGitlabReply));
    return yield* decodeGitlabObservation(() =>
      decodeGitlabPipeline(wire.body, projectId, args.pipeline_id)
    );
  }
);
/** Read exactly one job attempt. */
export const readGitlabJob = Effect.fn("readGitlabJob")(function* readGitlabJob(
  args: { job_id: number },
  op: GitlabOperation
) {
  const projectId = op.context.project_id;
  const wire = yield* gitlabOperationRequest(op, {
    jobId: args.job_id,
    kind: "job",
    projectId,
  }).pipe(Effect.flatMap(requireGitlabReply));
  return yield* decodeGitlabObservation(() =>
    decodeGitlabJob(wire.body, projectId, { jobId: args.job_id })
  );
});
/** Fetch one bounded page with all pipeline filters preserved. */
export const listGitlabPipelines = Effect.fn("listGitlabPipelines")(
  function* listGitlabPipelines(
    args: typeof gitlabCiInputs.pipelines.Type,
    op: GitlabOperation
  ) {
    const { project_id: projectId } = op.context;
    const { ref, sha, state } = args;
    const pageSize = args.page_size ?? 50;
    const request = yield* decodeGitlabObservation(() =>
      gitlabPageQuery(
        args.cursor,
        pipelineQueryIdentity(args, op.target),
        projectId
      )
    );
    const wire = yield* gitlabOperationRequest(op, {
      kind: "pipelines",
      page: request.page,
      pageSize,
      projectId,
      ...(ref ? { ref } : {}),
      ...(sha ? { sha } : {}),
      ...(state ? { state } : {}),
    }).pipe(Effect.flatMap(requireGitlabReply));
    return yield* decodeGitlabObservation(() => {
      const { next, rows } = decodeGitlabPage(wire, request.page, pageSize);
      const items = rows
        .map((row) => decodeGitlabPipeline(row, projectId))
        .toSorted((a, b) => b.id - a.id);
      if (
        items.some(
          (p) =>
            (ref && p.ref !== ref) ||
            (sha && p.sha !== sha) ||
            (state && p.state !== state)
        )
      ) {
        throw new Error("TARGET_MISMATCH");
      }
      return {
        complete: request.page === 1 && next === null,
        has_more: next !== null,
        items,
        next_cursor: next ? request.cursorFor(next) : null,
      };
    });
  }
);
/** Read one jobs page, keeping retry-attempt identity and strict pipeline association. */
export const readGitlabJobsPage = Effect.fn("readGitlabJobsPage")(
  function* readGitlabJobsPage(
    op: GitlabOperation,
    pipelineId: number,
    page: number,
    pageSize: number,
    includeRetried: boolean
  ) {
    const projectId = op.context.project_id;
    const wire = yield* gitlabOperationRequest(op, {
      includeRetried,
      kind: "jobs",
      page,
      pageSize,
      pipelineId,
      projectId,
    }).pipe(Effect.flatMap(requireGitlabReply));
    return yield* decodeGitlabObservation(() => {
      const { next, rows } = decodeGitlabPage(wire, page, pageSize);
      const items = rows.map((row) =>
        decodeGitlabJob(row, projectId, { pipelineId })
      );
      if (!includeRetried && items.some((item) => item.retried === true)) {
        throw new Error("TARGET_MISMATCH");
      }
      return { items, next };
    });
  }
);
/** Return only the requested jobs page and an explicitly bound continuation. */
export const listGitlabJobs = Effect.fn("listGitlabJobs")(
  function* listGitlabJobs(
    args: typeof gitlabCiInputs.jobs.Type,
    op: GitlabOperation
  ) {
    const pageSize = args.page_size ?? 50;
    const includeRetried = args.include_retried ?? false;
    const request = yield* decodeGitlabObservation(() =>
      gitlabPageQuery(
        args.cursor,
        jobQueryIdentity(args, op.target),
        op.context.project_id
      )
    );
    const { items, next } = yield* readGitlabJobsPage(
      op,
      args.pipeline_id,
      request.page,
      pageSize,
      includeRetried
    );
    return {
      complete: request.page === 1 && next === null,
      has_more: next !== null,
      items,
      next_cursor: next ? request.cursorFor(next) : null,
      pipeline_id: args.pipeline_id,
    };
  }
);
