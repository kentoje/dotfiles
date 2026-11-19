import { Effect } from "effect";

import { decodeGitlabPipeline } from "../ci/models.js";
import { readGitlabJobsPage, readGitlabPipeline } from "../ci/read.js";
import { gitlabOperationStopped } from "./operation.js";
import type { GitlabOperation } from "./operation.js";

const terminal = new Set(["success", "failed", "canceled", "skipped"]);
const cancellable = new Set([
  "created",
  "waiting_for_resource",
  "preparing",
  "pending",
  "running",
  "scheduled",
  "manual",
  "canceling",
]);

const countRetryableJobs = Effect.fn("countRetryableJobs")(
  function* countRetryableJobs(op: GitlabOperation, pipelineId: number) {
    const attempts = new Set<number>();
    let count = 0;
    let page = 1;
    while (page <= 100) {
      const { items, next } = yield* readGitlabJobsPage(
        op,
        pipelineId,
        page,
        100,
        false
      );
      for (const job of items) {
        if (attempts.has(job.id)) {
          return yield* Effect.fail(new Error("INCOMPLETE_PAGINATION"));
        }
        attempts.add(job.id);
        if (job.state === "failed" || job.state === "canceled") {
          count += 1;
        }
      }
      if (next === null) {
        return count;
      }
      page = next;
    }
    return yield* Effect.fail(new Error("SCAN_LIMIT"));
  }
);

/** Coordinate and authorize a single exact-target write, retaining uncertain remote delivery. */
export const applyGitlabPipelineMutation = Effect.fn(
  "applyGitlabPipelineMutation"
)(function* mutateSelectedPipeline(
  action: "retry" | "cancel",
  pipelineId: number,
  op: GitlabOperation
) {
  const { host, project_id: projectId, repository } = op.context;
  const target = { action, host, pipelineId, projectId, repository };
  const { acquireMutation, authorizeMutation, requestCi } = op.host;
  if (!acquireMutation || !authorizeMutation || !requestCi) {
    return yield* Effect.fail(new Error("AUTHORIZATION_REQUIRED"));
  }
  const release = acquireMutation(target);
  if (!release) {
    return yield* Effect.fail(new Error("WRITE_CONFLICT"));
  }
  return yield* Effect.gen(function* dispatchAuthorizedMutation() {
    const allowed = yield* authorizeMutation(target, op.invocation);
    const stop = gitlabOperationStopped(op.invocation);
    if (stop || !allowed) {
      return yield* Effect.fail(new Error(stop ?? "AUTHORIZATION_REQUIRED"));
    }
    const observed = yield* readGitlabPipeline({ pipeline_id: pipelineId }, op);
    if (
      action === "cancel" &&
      !terminal.has(observed.state) &&
      !cancellable.has(observed.state)
    ) {
      return yield* Effect.fail(new Error("UNKNOWN_PIPELINE_STATE"));
    }
    const count =
      action === "retry" ? yield* countRetryableJobs(op, pipelineId) : null;
    if (count === 0 || (action === "cancel" && terminal.has(observed.state))) {
      return {
        pipeline: observed,
        request_state: "no_change",
        ...(action === "cancel"
          ? { cancellation_confirmed: observed.state === "canceled" }
          : { retryable_jobs_observed: 0 }),
      };
    }
    const beforeSend = gitlabOperationStopped(op.invocation);
    if (beforeSend) {
      return yield* Effect.fail(new Error(beforeSend));
    }
    const effect = {
      outcome: "unknown" as "unknown" | "committed",
      phase: action,
      target: `${host}/${repository} pipeline ${pipelineId}`,
    };
    op.effects.push(effect);
    const wire = yield* requestCi(
      op.target,
      { kind: action, pipelineId, projectId },
      op.invocation
    ).pipe(Effect.uninterruptible);
    if (wire.kind === "error") {
      if (wire.delivery === "not_sent" || wire.delivery === "rejected") {
        op.effects.pop();
      }
      return yield* Effect.fail(new Error(wire.code));
    }
    const pipeline = yield* Effect.try({
      catch: () => new Error("REMOTE_STATE_UNKNOWN"),
      try: () => {
        const result = decodeGitlabPipeline(wire.body, projectId, pipelineId);
        if (result.sha !== observed.sha || result.ref !== observed.ref) {
          throw new Error("TARGET_MISMATCH");
        }
        return result;
      },
    });
    effect.outcome = "committed";
    return {
      pipeline,
      request_state: "accepted",
      ...(action === "cancel"
        ? { cancellation_confirmed: pipeline.state === "canceled" }
        : { retryable_jobs_observed: count }),
    };
  }).pipe(Effect.ensuring(Effect.sync(release)));
});
