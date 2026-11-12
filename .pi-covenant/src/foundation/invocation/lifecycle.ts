import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
/** Immutable host options are supplied by the extension, not by model-generated tool arguments. */
export interface PiHarnessOptions {
  readonly configPath?: string;
  readonly timeoutMs?: number;
}
/** Check stop at phase boundaries; in-flight cancellation is owned by each existing module. */
export function requirePiInvocationActive(
  signal: AbortSignal | undefined,
  deadline: number
) {
  if (signal?.aborted) {
    throw new Error(
      "PI_CANCELLED: invocation cancelled before module dispatch."
    );
  }
  if (Date.now() >= deadline) {
    throw new Error(
      "PI_DEADLINE: invocation deadline expired before module dispatch."
    );
  }
}
/** Compute one absolute host deadline; reject unusable configuration before effects. */
export function piInvocationDeadline(options: PiHarnessOptions) {
  const duration = options.timeoutMs ?? 600_000;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3_600_000) {
    throw new Error(
      "PI_DEADLINE: timeoutMs must be positive and at most one hour."
    );
  }
  return Date.now() + duration;
}
/** A module's structured details remain authoritative; concise text does not rewrite failures or partial effects. */
export function piToolResult(
  details: unknown,
  isError: boolean,
  text: string
): AgentToolResult<unknown> {
  return {
    content: [{ text, type: "text" satisfies "text" }],
    details,
    isError,
  };
}
/** Boundary failures do not retry or request another agent turn. */
export function piBoundaryFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "PI_INVOCATION: tool invocation failed.";
  return piToolResult(
    {
      completed_effects: [],
      error: {
        code: message.startsWith("PI_CANCELLED:")
          ? "PI_CANCELLED"
          : "PI_INVOCATION",
        message,
      },
      status: message.startsWith("PI_CANCELLED:") ? "cancelled" : "blocked",
    },
    true,
    message
  );
}
