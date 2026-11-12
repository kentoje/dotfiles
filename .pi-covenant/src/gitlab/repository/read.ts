import { Effect, Schema } from "effect";

import { resolveProjectContext } from "../../repository-context/module-port.js";
import { decodeGitlabProject } from "../transport/decode.js";
import type {
  GitlabReadInvocation,
  GitlabReaderHost,
} from "../transport/ports.js";

const requestSchema = Schema.Struct({
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.NonEmptyString),
});
function requireActive(invocation: GitlabReadInvocation, deadline: number) {
  if (invocation.signal?.aborted) {
    throw new Error("CANCELLED");
  }
  if (!Number.isFinite(deadline) || Date.now() >= deadline) {
    throw new Error("DEADLINE_EXCEEDED");
  }
}
function readFailureStatus(code: string) {
  if (code === "CANCELLED") {
    return "cancelled";
  }
  return [
    "INVALID_INPUT",
    "HOST_NOT_ALLOWED",
    "AMBIGUOUS_REMOTE",
    "CONTEXT_UNAVAILABLE",
    "CONTEXT_CONFLICT",
    "AUTH_REQUIRED",
    "FORBIDDEN",
  ].includes(code)
    ? "blocked"
    : "error";
}
/** Repository lookup uses only the selected target and read port; no pipeline effects or credential fields exist. */
export const readGitlabRepository = Effect.fn("readGitlabRepository")(
  function* readGitlabRepository(
    host: GitlabReaderHost,
    input: unknown,
    invocation: GitlabReadInvocation
  ) {
    let context: { host?: string; repository?: string; project_id?: number } =
      {};
    const deadline = Math.min(
      Date.now() + 30_000,
      invocation.deadline ?? Infinity
    );
    const scopedInvocation = { ...invocation, deadline };
    const lookup = Effect.gen(function* lookup() {
      yield* Effect.try({
        catch: () =>
          new Error(
            invocation.signal?.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED"
          ),
        try: () => requireActive(invocation, deadline),
      });
      const request = yield* Effect.try({
        catch: () => new Error("INVALID_INPUT"),
        try: () =>
          Schema.decodeUnknownSync(requestSchema, {
            onExcessProperty: "error",
          })(input),
      });
      const resolved = yield* Effect.tryPromise({
        catch: () => new Error("CONTEXT_UNAVAILABLE"),
        try: () =>
          resolveProjectContext(request, {
            gitlab: host.selection,
            sessionCwd: host.sessionCwd,
          }),
      });
      const { data } = resolved;
      const target = data?.gitlab_target;
      if (!data || !target) {
        return yield* Effect.fail(
          new Error(resolved.error?.code ?? "CONTEXT_UNAVAILABLE")
        );
      }
      context = { host: target.host, repository: target.project_path };
      yield* Effect.try({
        catch: () =>
          new Error(
            invocation.signal?.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED"
          ),
        try: () => requireActive(invocation, deadline),
      });
      const wire = yield* host.readProject(target, scopedInvocation);
      if (wire.kind === "error") {
        return yield* Effect.fail(new Error(wire.code));
      }
      const project = yield* Effect.try({
        catch: (error) =>
          new Error(
            error instanceof Error && error.message === "TARGET_MISMATCH"
              ? "TARGET_MISMATCH"
              : "MALFORMED_RESPONSE"
          ),
        try: () =>
          decodeGitlabProject(wire.body, target.project_path, target.host),
      });
      yield* Effect.try({
        catch: () =>
          new Error(
            invocation.signal?.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED"
          ),
        try: () => requireActive(invocation, deadline),
      });
      context = { ...context, project_id: project.id };
      const local = target.remote_name !== null;
      return {
        completed_effects: [],
        context,
        data: {
          default_branch: project.default_branch,
          identity: {
            branch: local ? data.branch : null,
            head_sha: local ? data.head_sha : null,
            host: target.host,
            repository: project.path_with_namespace,
          },
          local_checkout: local ? data.worktree_root : null,
          web_url: project.web_url,
        },
        error: null,
        status: "ok",
        warnings: [],
      };
    });
    return yield* lookup.pipe(
      Effect.catch((error) =>
        Effect.succeed({
          completed_effects: [],
          context,
          data: null,
          error: {
            code: error.message,
            message: `GitLab repository read failed: ${error.message}`,
            phase: "repository",
            retryable: false,
          },
          status: readFailureStatus(error.message),
          warnings: [],
        })
      )
    );
  }
);
