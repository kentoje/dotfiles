import { NodeServices } from "@effect/platform-node";
import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

export interface DevelopmentCommand {
  id: string;
  command: string;
  args: readonly string[];
  timeout: number;
  maxBytes?: number;
}
export interface DevelopmentCommandResult {
  id: string;
  status: "passed" | "failed" | "timed_out" | "unavailable" | "not_run";
  code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
}
/** Execute an argv command in a bounded process scope; no failure or partial output is success. */
export const runDevelopmentCommand = Effect.fn("runDevelopmentCommand")(
  function* runDevelopmentCommand(spec: DevelopmentCommand, cwd: string) {
    const started = Date.now();
    const limit = spec.maxBytes ?? 4 * 1024 * 1024;
    const output = { stderr: "", stdout: "", truncated: false };
    const execution = Effect.gen(function* executeDevelopmentCommand() {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make(spec.command, spec.args, {
          cwd,
          detached: true,
          extendEnv: true,
          forceKillAfter: "250 millis",
          stderr: "pipe",
          stdin: "ignore",
          stdout: "pipe",
        })
      );
      const collect = (
        key: "stdout" | "stderr",
        stream: typeof handle.stdout
      ) =>
        stream.pipe(
          Stream.runForEach((chunk) =>
            Effect.sync(() => {
              const text = Buffer.from(chunk).toString("utf-8");
              const remaining = limit - Buffer.byteLength(output[key]);
              if (chunk.length > remaining) {
                output.truncated = true;
              }
              output[key] += Buffer.from(text)
                .subarray(0, Math.max(0, remaining))
                .toString("utf-8");
            })
          )
        );
      const captured = yield* Effect.all(
        [
          collect("stdout", handle.stdout),
          collect("stderr", handle.stderr),
          handle.exitCode,
        ],
        { concurrency: "unbounded" }
      );
      const { 2: code } = captured;
      return {
        code: Number(code),
        status: Number(code) === 0 && !output.truncated ? "passed" : "failed",
      } satisfies Pick<DevelopmentCommandResult, "status" | "code">;
    }).pipe(Effect.scoped);
    const status = yield* execution.pipe(
      Effect.timeoutOrElse({
        duration: spec.timeout,
        orElse: () =>
          Effect.succeed({ code: null, status: "timed_out" } satisfies Pick<
            DevelopmentCommandResult,
            "status" | "code"
          >),
      }),
      Effect.catch(() =>
        Effect.succeed({ code: null, status: "unavailable" } satisfies Pick<
          DevelopmentCommandResult,
          "status" | "code"
        >)
      ),
      Effect.provide(NodeServices.layer)
    );
    return {
      id: spec.id,
      ...status,
      ...output,
      durationMs: Date.now() - started,
    } satisfies DevelopmentCommandResult;
  }
);
