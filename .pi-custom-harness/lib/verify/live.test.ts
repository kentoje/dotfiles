import { expect, test } from "bun:test";
import { Effect } from "effect";

import { VerifyCommandService } from "./core";
import {
  VerifyCommandLiveLayerWithTransport,
  type VerifyCommandRequest,
  type VerifyCommandResult,
  type VerifyCommandTransport,
} from "./live";

const request: VerifyCommandRequest = {
  cwd: "/workspace",
  check: "ts:check",
};

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

test("maps transport failures to VerifyCommandExecutionError", async () => {
  await expect(
    runCheck(() => Effect.fail(new Error("spawn denied"))),
  ).rejects.toMatchObject({
    _tag: "VerifyCommandExecutionError",
    message: "verification command failed to start: spawn denied",
  });
});
