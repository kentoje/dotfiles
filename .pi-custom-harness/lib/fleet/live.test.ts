import { expect, test } from "bun:test";
import { Effect } from "effect";
import type { RepositoryFleetEntry } from "../repo-map/core";
import { FleetGitService, type FleetGitStatus } from "./core";

const repository = {
  name: "example",
  path: "/tmp/fleet-contract/example",
} satisfies RepositoryFleetEntry;

test("fleet git status service returns the complete injected repository status", async () => {
  const status = {
    branch: "feature/contract",
    dirty: true,
    ahead: 2,
    behind: 1,
  } satisfies FleetGitStatus;

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* FleetGitService;
      return yield* service.statusFor({ repository });
    }).pipe(
      Effect.provideService(FleetGitService, {
        statusFor: () => Effect.succeed(status),
        syncPlanFor: () =>
          Effect.succeed({
            repository,
            ...status,
            pending: [" M package.json"],
          }),
        syncHardFor: () => Effect.void,
      }),
    ),
  );

  expect(result).toEqual(status);
});
