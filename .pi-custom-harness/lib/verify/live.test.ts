import { expect, test } from "bun:test";
import { Effect } from "effect";

import { VerifyCommandService } from "./core";
import {
  VerifyCommandLiveLayerWithTransport,
  type VerifyCommandRequest,
  type VerifyCommandResult,
  type VerifyCommandTransport,
} from "./live";

const request = {
  cwd: "/workspace",
  check: "ts:check",
  testRunner: "none",
} as const;

const runCheck = (transport: VerifyCommandTransport) =>
  Effect.runPromise(
    VerifyCommandService.use((service) => service.runCheck(request)).pipe(
      Effect.provide(VerifyCommandLiveLayerWithTransport(transport)),
    ),
  );

test("returns complete command output and exit code from the transport", async () => {
  const result: VerifyCommandResult = {
    exitCode: 1,
    output: "first diagnostic\nsecond diagnostic\n",
  };

  await expect(runCheck(() => Effect.succeed(result))).resolves.toEqual(result);
});

test("runs Vitest repository checks once instead of entering watch mode", async () => {
  const requests: VerifyCommandRequest[] = [];
  const result = await Effect.runPromise(
    VerifyCommandService.use((service) =>
      service.runCheck({
        cwd: "/worktree",
        check: "test",
        testRunner: "vitest",
      }),
    ).pipe(
      Effect.provide(
        VerifyCommandLiveLayerWithTransport((request) => {
          requests.push(request);
          return Effect.succeed({ exitCode: 0, output: "passed" });
        }),
      ),
    ),
  );

  expect(requests).toEqual([
    {
      cwd: "/worktree",
      program: "pnpm",
      args: ["run", "test", "--run"],
    },
  ]);
  expect(result).toEqual({ exitCode: 0, output: "passed" });
});

test("maps transport failures to VerifyCommandExecutionError", async () => {
  await expect(
    runCheck(() => Effect.fail(new Error("spawn denied"))),
  ).rejects.toMatchObject({
    _tag: "VerifyCommandExecutionError",
    message: "verification command failed to start: spawn denied",
  });
});
