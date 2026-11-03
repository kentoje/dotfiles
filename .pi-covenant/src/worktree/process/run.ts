import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { worktreeFailure } from "../model.js";

/** Scoped process groups stop descendants on interruption; captured output is bounded. */
export const runWorktreeProcess = Effect.fn("runWorktreeProcess")(
  function* runWorktreeProcess(
    command: string,
    args: readonly string[],
    cwd: string,
    env: Record<string, string> = {}
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(command, args, {
        cwd,
        detached: true,
        env: {
          ...env,
          GIT_COMMON_DIR: undefined,
          GIT_DIR: undefined,
          GIT_INDEX_FILE: undefined,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_TERMINAL_PROMPT: "0",
          GIT_WORK_TREE: undefined,
        },
        extendEnv: true,
        forceKillAfter: "250 millis",
        stderr: "pipe",
        stdin: "ignore",
        stdout: "pipe",
      })
    );
    const collect = (stream: typeof handle.stdout) =>
      stream.pipe(
        Stream.runFold(
          () => ({ bytes: 0, text: "" }),
          (state, chunk) => ({
            bytes: state.bytes + chunk.length,
            text:
              state.text +
              (state.bytes < 65_536
                ? Buffer.from(chunk)
                    .subarray(0, 65_536 - state.bytes)
                    .toString("utf-8")
                : ""),
          })
        )
      );
    const [stdout, stderr, code] = yield* Effect.all(
      [collect(handle.stdout), collect(handle.stderr), handle.exitCode],
      { concurrency: "unbounded" }
    );
    return {
      code: Number(code),
      stderr: stderr.text,
      stdout: stdout.text,
      truncated: stdout.bytes > 65_536 || stderr.bytes > 65_536,
    };
  },
  Effect.scoped,
  Effect.mapError(() =>
    worktreeFailure(
      "PROCESS_FAILED",
      "Worktree process could not run or clean up."
    )
  )
);

/** Git is always invoked as an argument vector, without shell expansion or repository hooks. */
export const runWorktreeGit = Effect.fn("runWorktreeGit")(
  function* runWorktreeGit(cwd: string, args: readonly string[]) {
    const result = yield* runWorktreeProcess(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args],
      cwd
    );
    if (result.code !== 0) {
      return yield* worktreeFailure(
        "LOOKUP_FAILED",
        `Git operation failed: ${args[0] ?? "unknown"}.`
      );
    }
    if (result.truncated) {
      return yield* worktreeFailure(
        "OUTPUT_LIMIT",
        "Git output exceeded the bounded lookup window."
      );
    }
    return result.stdout.trimEnd();
  }
);
