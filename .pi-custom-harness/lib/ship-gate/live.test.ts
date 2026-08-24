import { expect, test } from "bun:test";
import { Effect } from "effect";

import { ShipGateFactsError, ShipGateGitService } from "./core";

test("ship-gate Git service reports its typed failure unchanged", async () => {
  const result = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const service = yield* ShipGateGitService;
      return yield* service.commitsAheadOfBase({
        cwd: "/tmp/ship-gate-contract",
      });
    }).pipe(
      Effect.provideService(ShipGateGitService, {
        commitsAheadOfBase: () =>
          Effect.fail(
            new ShipGateFactsError({ message: "isolated fake failure" }),
          ),
      }),
    ),
  );

  expect(result._tag).toBe("Failure");
  if (result._tag === "Failure") {
    expect(result.cause.reasons[0]).toMatchObject({
      _tag: "Fail",
      error: { _tag: "ShipGateFactsError", message: "isolated fake failure" },
    });
  }
});
