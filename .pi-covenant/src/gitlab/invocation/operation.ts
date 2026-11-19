import { Effect, Schema } from "effect";

import type { GitlabTarget } from "../../repository-context/module-port.js";
import { readGitlabRepository } from "../repository/read.js";
import type { GitlabCiRequest } from "../transport/ci-request.js";
import type {
  GitlabReadInvocation,
  GitlabReaderHost,
  GitlabWireResult,
} from "../transport/ports.js";

interface GitlabEffectRecord {
  outcome: "committed" | "unknown";
  phase: string;
  target: string;
}
interface ReadRequest {
  readonly cwd?: string;
  readonly repository?: string;
}
/** Operation state holds only sanitized identities, observed outcomes and the inherited deadline. */
export interface GitlabOperation {
  readonly context: { host: string; repository: string; project_id: number };
  readonly target: GitlabTarget;
  readonly invocation: GitlabReadInvocation;
  readonly host: GitlabReaderHost;
  readonly effects: GitlabEffectRecord[];
  readonly warnings: string[];
}
const blocked = new Set([
  "INVALID_INPUT",
  "INVALID_CURSOR",
  "AUTH_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "FORBIDDEN",
  "HOST_NOT_ALLOWED",
  "WRITE_CONFLICT",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_CONFLICT",
  "AMBIGUOUS_REMOTE",
  "UNAVAILABLE",
  "UNKNOWN_PIPELINE_STATE",
]);

/** Recheck stop boundaries before dependent reads and immediately before mutation dispatch. */
export function gitlabOperationStopped(invocation: GitlabReadInvocation) {
  if (invocation.signal?.aborted) {
    return "CANCELLED";
  }
  if (
    invocation.deadline !== undefined &&
    (!Number.isFinite(invocation.deadline) || Date.now() >= invocation.deadline)
  ) {
    return "DEADLINE_EXCEEDED";
  }
  return null;
}
/** Keep remote delivery information available until the operation commits its final outcome. */
export function gitlabOperationRequest(
  op: GitlabOperation,
  request: GitlabCiRequest
): Effect.Effect<GitlabWireResult, Error> {
  const stopped = gitlabOperationStopped(op.invocation);
  if (stopped) {
    return Effect.fail(new Error(stopped));
  }
  if (!op.host.requestCi) {
    return Effect.fail(new Error("UNAVAILABLE"));
  }
  return op.host.requestCi(op.target, request, op.invocation);
}
/** Decode untrusted provider data into stable errors without leaking raw schema diagnostics. */
export function decodeGitlabObservation<T>(decode: () => T) {
  return Effect.try({
    catch: (error) => {
      if (
        error instanceof Error &&
        [
          "TARGET_MISMATCH",
          "INVALID_CURSOR",
          "INCOMPLETE_PAGINATION",
          "SCAN_LIMIT",
          "REMOTE_STATE_UNKNOWN",
        ].includes(error.message)
      ) {
        return new Error(error.message);
      }
      return new Error("MALFORMED_RESPONSE");
    },
    try: decode,
  });
}
/** Convert a complete read reply or a typed transport failure into the operation's effect. */
export function requireGitlabReply(wire: GitlabWireResult) {
  return wire.kind === "ok"
    ? Effect.succeed(wire)
    : Effect.fail(new Error(wire.code));
}
/** All CI operations validate input before looking up the project and share one absolute deadline. */
export function runGitlabOperation<
  S extends Schema.Decoder<ReadRequest>,
  T,
>(options: {
  host: GitlabReaderHost;
  input: unknown;
  invocation: GitlabReadInvocation;
  schema: S;
  action: string;
  checkTarget?: (request: S["Type"], target: GitlabTarget) => void;
  run: (request: S["Type"], op: GitlabOperation) => Effect.Effect<T, Error>;
}) {
  return Effect.gen(function* runOperation() {
    const duration =
      options.action === "retry" || options.action === "cancel"
        ? 60_000
        : 30_000;
    const invocation = {
      ...options.invocation,
      deadline: Math.min(
        Date.now() + duration,
        options.invocation.deadline ?? Infinity
      ),
    };
    const effects: GitlabEffectRecord[] = [];
    const warnings: string[] = [];
    let context: Partial<GitlabOperation["context"]> = {};
    const result = yield* Effect.result(
      Effect.gen(function* resolveOperation() {
        const args = yield* Effect.try({
          catch: () => new Error("INVALID_INPUT"),
          try: () =>
            Schema.decodeUnknownSync(options.schema, {
              onExcessProperty: "error",
            })(options.input),
        });
        const resolved = yield* readGitlabRepository(
          options.host,
          {
            ...(args.cwd ? { cwd: args.cwd } : {}),
            ...(args.repository ? { repository: args.repository } : {}),
          },
          invocation,
          (target) =>
            decodeGitlabObservation(() => options.checkTarget?.(args, target))
        );
        ({ context } = resolved);
        const { host, project_id, repository } = context;
        if (!resolved.data || !host || !project_id || !repository) {
          return yield* Effect.fail(
            new Error(resolved.error?.code ?? "CONTEXT_UNAVAILABLE")
          );
        }
        return yield* options.run(args, {
          context: { host, project_id, repository },
          effects,
          host: options.host,
          invocation,
          target: {
            host,
            project_path: repository,
            remote_name: null,
            source: "validated project lookup",
          },
          warnings,
        });
      })
    );
    if (result._tag === "Success") {
      return {
        completed_effects: effects,
        context,
        data: result.success,
        error: null,
        status: "ok",
        warnings,
      };
    }
    const code = result.failure.message;
    let status = "error";
    if (effects.some((effect) => effect.outcome === "unknown")) {
      status = "indeterminate";
    } else if (code === "CANCELLED") {
      status = "cancelled";
    } else if (blocked.has(code)) {
      status = "blocked";
    }
    return {
      completed_effects: effects,
      context,
      data: null,
      error: {
        code,
        message: `GitLab ${options.action} failed: ${code}`,
        phase: options.action,
        retryable: false,
      },
      status,
      warnings,
    };
  });
}
