import { Effect } from "effect";

import { worktreeFailure } from "../model.js";
import type { WorktreeFailure, WorktreeInvocation } from "../model.js";

/** Bridge host cancellation into fiber interruption; dependent work inherits one absolute deadline. */
export function boundWorktreeInvocation<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  invocation: WorktreeInvocation,
  defaultMilliseconds: number
) {
  const deadline = invocation.deadline ?? Date.now() + defaultMilliseconds;
  if (!Number.isFinite(deadline)) {
    return Effect.fail(
      worktreeFailure("INVALID_INPUT", "Invocation deadline must be finite.")
    );
  }
  const { signal } = invocation;
  const cancelled = Effect.callback<never, WorktreeFailure>((resume) => {
    const abort = () =>
      resume(
        Effect.fail(
          worktreeFailure(
            "CANCELLED",
            "Worktree invocation cancelled; committed work is retained."
          )
        )
      );
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener("abort", abort, { once: true });
    }
    return Effect.sync(() => signal?.removeEventListener("abort", abort));
  });
  if (signal?.aborted) {
    return Effect.fail(
      worktreeFailure(
        "CANCELLED",
        "Worktree invocation cancelled before execution."
      )
    );
  }
  if (deadline <= Date.now()) {
    return Effect.fail(
      worktreeFailure(
        "DEADLINE_EXCEEDED",
        "Worktree invocation deadline expired before execution."
      )
    );
  }
  return Effect.raceFirst(effect, cancelled).pipe(
    Effect.timeoutOrElse({
      duration: Math.max(0, deadline - Date.now()),
      orElse: () =>
        Effect.fail(
          worktreeFailure(
            "DEADLINE_EXCEEDED",
            "Worktree invocation deadline exceeded; committed work is retained."
          )
        ),
    })
  );
}
