import { Schema } from "effect";

import { gitlabId } from "../transport/ci-request.js";

const text = Schema.NonEmptyString;
const optionalText = Schema.optionalKey(Schema.NullOr(text));
const optionalFlag = Schema.optionalKey(Schema.NullOr(Schema.Boolean));
const pipelineSchema = Schema.Struct({
  id: gitlabId,
  project_id: Schema.optionalKey(gitlabId),
  ref: text,
  sha: text,
  source: optionalText,
  status: text,
  web_url: optionalText,
});
const jobSchema = Schema.Struct({
  allow_failure: optionalFlag,
  commit: Schema.optionalKey(Schema.NullOr(Schema.Struct({ id: text }))),
  id: gitlabId,
  name: text,
  pipeline: Schema.Struct({
    id: gitlabId,
    project_id: Schema.optionalKey(gitlabId),
    ref: optionalText,
    sha: optionalText,
  }),
  ref: optionalText,
  retried: optionalFlag,
  sha: optionalText,
  stage: optionalText,
  status: text,
  web_url: optionalText,
});
/** Validate provider identity before projecting pipeline status into the public DTO. */
export function decodeGitlabPipeline(
  value: unknown,
  projectId: number,
  pipelineId?: number
) {
  const p = Schema.decodeUnknownSync(pipelineSchema)(value);
  if (
    (pipelineId !== undefined && p.id !== pipelineId) ||
    (p.project_id !== undefined && p.project_id !== projectId)
  ) {
    throw new Error("TARGET_MISMATCH");
  }
  return {
    id: p.id,
    ref: p.ref,
    sha: p.sha,
    state: p.status,
    ...(p.source ? { source: p.source } : {}),
    ...(p.web_url ? { url: p.web_url } : {}),
  };
}
/** Preserve the exact job attempt and parent pipeline; absent flags stay absent. */
export function decodeGitlabJob(
  value: unknown,
  projectId: number,
  expected: { jobId?: number; pipelineId?: number }
) {
  const job = Schema.decodeUnknownSync(jobSchema)(value);
  if (
    (expected.jobId !== undefined && expected.jobId !== job.id) ||
    (expected.pipelineId !== undefined &&
      expected.pipelineId !== job.pipeline.id) ||
    (job.pipeline.project_id !== undefined &&
      job.pipeline.project_id !== projectId)
  ) {
    throw new Error("TARGET_MISMATCH");
  }
  const sha = job.commit?.id ?? job.sha ?? job.pipeline.sha;
  const ref = job.ref ?? job.pipeline.ref;
  return {
    id: job.id,
    name: job.name,
    pipeline_id: job.pipeline.id,
    state: job.status,
    ...(typeof job.allow_failure === "boolean"
      ? { allow_failure: job.allow_failure }
      : {}),
    ...(typeof job.retried === "boolean" ? { retried: job.retried } : {}),
    ...(job.stage ? { stage: job.stage } : {}),
    ...(job.web_url ? { url: job.web_url } : {}),
    ...(sha ? { sha } : {}),
    ...(ref ? { ref } : {}),
  };
}
