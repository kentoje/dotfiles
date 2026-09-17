import { Cause, Effect, Exit } from "effect";

import type { VerifyReport } from "./core";

export interface VerifyExecutionSnapshot {
  readonly action: "types" | "lint" | "test" | "all";
  readonly worktree: string;
  readonly file: string | undefined;
  readonly fingerprint: string | undefined;
}

export interface VerifyExecutionCoordinator {
  readonly run: (input: {
    readonly snapshot: VerifyExecutionSnapshot;
    readonly execute: () => Promise<VerifyReport>;
  }) => Promise<VerifyReport>;
}

const verificationCacheKey = (snapshot: VerifyExecutionSnapshot): string =>
  JSON.stringify(snapshot);

/** Serializes heavy verification and reuses a completed result for an unchanged Git snapshot. */
export const createVerifyExecutionCoordinator =
  (): VerifyExecutionCoordinator => {
    const completedReports = new Map<string, VerifyReport>();
    let queue = Promise.resolve();

    return {
      run: ({ snapshot, execute }) => {
        const key =
          snapshot.fingerprint === undefined
            ? undefined
            : verificationCacheKey(snapshot);
        const cached =
          key === undefined ? undefined : completedReports.get(key);
        if (cached !== undefined) return Promise.resolve(cached);

        const pending = queue.then(execute, execute);
        queue = pending.then(
          () => undefined,
          () => undefined,
        );
        return pending.then((report) => {
          if (key !== undefined && report.status === "completed") {
            completedReports.set(key, report);
          }
          return report;
        });
      },
    };
  };

/** Runs the Effect verification plan and converts interruption into a structured report. */
export const runVerifyEffect = async <Error>(input: {
  readonly effect: Effect.Effect<VerifyReport, Error>;
  readonly signal: AbortSignal | undefined;
  readonly worktree: string;
}): Promise<VerifyReport> => {
  const exit = await Effect.runPromiseExit(input.effect, {
    signal: input.signal,
  });
  return Exit.match(exit, {
    onSuccess: (report) => report,
    onFailure: (cause) => ({
      ok: false,
      status: Cause.hasInterruptsOnly(cause) ? "interrupted" : "completed",
      worktree: input.worktree,
      failures: [
        {
          file: "",
          line: 0,
          rule: "verify",
          message: Cause.hasInterruptsOnly(cause)
            ? "Verification was explicitly cancelled."
            : `Verification failed unexpectedly: ${String(Cause.squash(cause))}`,
        },
      ],
      duration: 0,
    }),
  });
};
