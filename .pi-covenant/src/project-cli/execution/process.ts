import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { ProjectCheckSpec } from "../configuration/plan.js";

/** One mandatory check retains bounded diagnostics and an explicit terminal outcome. */
export interface ProjectCheckResult extends ProjectCheckSpec {
  status:
    | "passed"
    | "failed"
    | "timed_out"
    | "unavailable"
    | "cancelled"
    | "not_run";
  code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  duration_ms: number;
}

/** Shared host cancellation and absolute deadline; neither comes from project JSON. */
export interface ProjectCheckInvocation {
  signal?: AbortSignal;
  deadline?: number;
}

/** Represent a required check that was not executed; it can never support success. */
export function unexecutedProjectCheck(
  spec: ProjectCheckSpec
): ProjectCheckResult {
  return {
    ...spec,
    code: null,
    duration_ms: 0,
    status: "not_run",
    stderr: "",
    stdout: "",
    truncated: false,
  };
}

/** Run one argv command in an owned process group, including bounded output and cleanup. */
export const executeProjectCheck = Effect.fn("executeProjectCheck")(
  function* executeProjectCheck(
    spec: ProjectCheckSpec,
    invocation: ProjectCheckInvocation
  ) {
    const started = Date.now();
    const output = { stderr: "", stdout: "", truncated: false };
    const limit = 65_536;
    const execution = Effect.gen(function* executeCheckProcess() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const child = yield* spawner.spawn(
        ChildProcess.make(spec.command, spec.args, {
          cwd: spec.cwd,
          detached: true,
          extendEnv: true,
          forceKillAfter: "250 millis",
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
        })
      );
      const collect = (key: "stdout" | "stderr", stream: typeof child.stdout) =>
        stream.pipe(
          Stream.runForEach((chunk) =>
            Effect.sync(() => {
              const remaining = Math.max(
                0,
                limit - Buffer.byteLength(output[key])
              );
              output.truncated ||= chunk.length > remaining;
              output[key] += Buffer.from(chunk)
                .subarray(0, remaining)
                .toString("utf-8");
            })
          )
        );
      const captured = yield* Effect.all(
        [
          collect("stdout", child.stdout),
          collect("stderr", child.stderr),
          child.exitCode,
        ],
        { concurrency: "unbounded" }
      );
      const { 2: exit } = captured;
      const status: ProjectCheckResult["status"] =
        Number(exit) === 0 ? "passed" : "failed";
      return { code: Number(exit), status } satisfies Pick<
        ProjectCheckResult,
        "code" | "status"
      >;
    }).pipe(
      Effect.scoped,
      Effect.catch(() =>
        Effect.succeed({ code: null, status: "unavailable" } satisfies Pick<
          ProjectCheckResult,
          "code" | "status"
        >)
      )
    );
    const cancellation = Effect.callback<
      Pick<ProjectCheckResult, "code" | "status">
    >((resume) => {
      const abort = () =>
        resume(Effect.succeed({ code: null, status: "cancelled" }));
      if (invocation.signal?.aborted) {
        abort();
      } else {
        invocation.signal?.addEventListener("abort", abort, { once: true });
      }
      return Effect.sync(() =>
        invocation.signal?.removeEventListener("abort", abort)
      );
    });
    if (invocation.signal?.aborted) {
      return {
        ...unexecutedProjectCheck(spec),
        status: "cancelled",
      } satisfies ProjectCheckResult;
    }
    const remaining = Math.min(
      spec.timeout_ms,
      (invocation.deadline ?? Number.POSITIVE_INFINITY) - Date.now()
    );
    if (remaining <= 0) {
      return {
        ...unexecutedProjectCheck(spec),
        status: "timed_out",
      } satisfies ProjectCheckResult;
    }
    const result = yield* Effect.raceFirst(execution, cancellation).pipe(
      Effect.timeoutOrElse({
        duration: remaining,
        orElse: () =>
          Effect.succeed({ code: null, status: "timed_out" } satisfies Pick<
            ProjectCheckResult,
            "code" | "status"
          >),
      })
    );
    return {
      ...spec,
      ...result,
      ...output,
      duration_ms: Date.now() - started,
    } satisfies ProjectCheckResult;
  }
);
