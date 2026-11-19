import {
  checkJobCursor,
  checkPipelineCursor,
  gitlabCiInputs,
  listGitlabJobs,
  listGitlabPipelines,
  readGitlabJob,
  readGitlabPipeline,
} from "./ci/read.js";
import { applyGitlabPipelineMutation } from "./invocation/mutation.js";
import { runGitlabOperation } from "./invocation/operation.js";
import { readGitlabLogs } from "./logs/read.js";
import { lookupGitlabOpenMrs } from "./merge-requests/lookup.js";
import { readGitlabRepository } from "./repository/read.js";
import type {
  GitlabReaderHost,
  GitlabReadInvocation,
} from "./transport/ports.js";
/** Expose repository and CI operations, with separate host authority for pipeline mutations. */
export function makeGitlabModule(host: GitlabReaderHost) {
  return {
    cancel: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "cancel",
        host,
        input,
        invocation,
        run: (args, op) =>
          applyGitlabPipelineMutation("cancel", args.pipeline_id, op),
        schema: gitlabCiInputs.cancel,
      }),
    job: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "job",
        host,
        input,
        invocation,
        run: readGitlabJob,
        schema: gitlabCiInputs.job,
      }),
    jobs: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "jobs",
        checkTarget: checkJobCursor,
        host,
        input,
        invocation,
        run: listGitlabJobs,
        schema: gitlabCiInputs.jobs,
      }),
    logs: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "logs",
        host,
        input,
        invocation,
        run: readGitlabLogs,
        schema: gitlabCiInputs.logs,
      }),
    lookup_open_mrs: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "lookup_open_mrs",
        host,
        input,
        invocation,
        run: lookupGitlabOpenMrs,
        schema: gitlabCiInputs.lookup_open_mrs,
      }),
    pipeline: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "pipeline",
        host,
        input,
        invocation,
        run: readGitlabPipeline,
        schema: gitlabCiInputs.pipeline,
      }),
    pipelines: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "pipelines",
        checkTarget: checkPipelineCursor,
        host,
        input,
        invocation,
        run: listGitlabPipelines,
        schema: gitlabCiInputs.pipelines,
      }),
    repository: (input: unknown = {}, invocation: GitlabReadInvocation = {}) =>
      readGitlabRepository(host, input, invocation),
    retry: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runGitlabOperation({
        action: "retry",
        host,
        input,
        invocation,
        run: (args, op) =>
          applyGitlabPipelineMutation("retry", args.pipeline_id, op),
        schema: gitlabCiInputs.retry,
      }),
  };
}
/** Host callbacks carry credential-free inputs and sanitized results across the module boundary. */
export type {
  GitlabReaderHost,
  GitlabReadInvocation,
  GitlabWireResult,
} from "./transport/ports.js";

/** Closed CI request vocabulary for the trusted host. */
export { gitlabCiRequest } from "./transport/ci-request.js";
/** Exact resource and action identifiers cross the host boundary without credentials. */
export type {
  GitlabCiRequest,
  GitlabMutationTarget,
} from "./transport/ci-request.js";
