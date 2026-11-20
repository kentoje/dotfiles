import { Effect } from "effect";
import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

import type {
  GitlabReadInvocation,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import type { MrAuthorization, MrContext, MrHost, MrRequest } from "./ports.js";

type MrStatus =
  | "ok"
  | "error"
  | "blocked"
  | "partial"
  | "cancelled"
  | "indeterminate";
export class MrOperationError extends Error {
  readonly code: string;
  readonly status: Exclude<MrStatus, "ok">;
  readonly details: object | undefined;
  constructor(
    code: string,
    status: Exclude<MrStatus, "ok"> = "error",
    details?: object
  ) {
    super(code);
    this.name = "MrOperationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
interface MrEffect {
  phase: string;
  target: string;
  outcome: "committed" | "unknown";
  reference?: string;
}

export interface MrOperation {
  readonly context: MrContext;
  readonly effects: MrEffect[];
  readonly host: MrHost;
  readonly invocation: GitlabReadInvocation;
  requireActive: () => void;
  authorize: (
    request: Omit<MrAuthorization, "host" | "repository">
  ) => Promise<void>;
  request: (request: MrRequest) => Promise<GitlabWireResult>;
}

export function requireMrWire(wire: GitlabWireResult) {
  if (wire.kind === "ok") {
    return wire;
  }
  const status = wire.code === "CANCELLED" ? "cancelled" : "error";
  throw new MrOperationError(wire.code, status);
}

export function runMrOperation<S extends TSchema, D>(options: {
  action: string;
  host: MrHost;
  input: unknown;
  invocation: GitlabReadInvocation;
  schema: S;
  write?: boolean;
  run: (
    input: Static<S>,
    op: MrOperation
  ) => Promise<{ data: D; failure?: MrOperationError }>;
}) {
  return Effect.promise(async (effectSignal) => {
    const { action, host, input, schema, run } = options;
    const deadline = Math.min(
      options.invocation.deadline ?? Infinity,
      Date.now() + (options.write ? 60_000 : 30_000)
    );
    const signal = AbortSignal.any([
      effectSignal,
      AbortSignal.timeout(Math.max(0, Math.ceil(deadline - Date.now()))),
      ...(options.invocation.signal ? [options.invocation.signal] : []),
    ]);
    const invocation = { deadline, signal };
    const context: MrContext = {};
    const effects: MrEffect[] = [];
    const finish = (data: D | null, failure?: MrOperationError) => ({
      completed_effects: effects,
      context,
      data,
      error: failure
        ? {
            code: failure.code,
            message: `MR ${action}: ${failure.code}`,
            phase: action,
            retryable: false,
            ...(failure.details ? { details: failure.details } : {}),
          }
        : null,
      status: failure?.status ?? "ok",
      warnings: [],
    });
    const requireActive = () => {
      if (signal.aborted || Date.now() >= deadline) {
        throw new MrOperationError("CANCELLED", "cancelled");
      }
    };
    const op: MrOperation = {
      async authorize(request) {
        requireActive();
        const allowed =
          context.host &&
          context.repository &&
          (await host
            .authorize?.(
              {
                ...request,
                host: context.host,
                repository: context.repository,
              },
              signal
            )
            .catch(() => false));
        requireActive();
        if (!allowed) {
          throw new MrOperationError("AUTHORIZATION_REQUIRED", "blocked");
        }
      },
      context,
      effects,
      host,
      invocation,
      async request(request) {
        requireActive();
        if (
          !context.host ||
          !context.repository ||
          context.project_id !== request.projectId
        ) {
          throw new MrOperationError("TARGET_MISMATCH", "blocked");
        }
        return await Effect.runPromise(
          host.request(
            {
              host: context.host,
              project_path: context.repository,
              remote_name: null,
              source: "verified MR project",
            },
            request,
            invocation
          )
        );
      },
      requireActive,
    };
    try {
      requireActive();
      if (!Value.Check(schema, input)) {
        throw new MrOperationError("INVALID_INPUT", "blocked");
      }
      const result = await run(input, op);
      return finish(result.data, result.failure);
    } catch (error) {
      return finish(
        null,
        error instanceof MrOperationError
          ? error
          : new MrOperationError("LOOKUP_FAILED")
      );
    }
  });
}
