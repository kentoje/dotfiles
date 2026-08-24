import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ShipGateFactsError, ShipGateGitService } from "./core";

/** Runs the narrow Git query used to detect unshipped branch commits. */
export const ShipGateGitLiveLayer = Layer.effect(
  ShipGateGitService,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    return ShipGateGitService.of({
      commitsAheadOfBase: ({ cwd }) =>
        Effect.scoped(
          Effect.gen(function* () {
            const command = ChildProcess.make(
              "git",
              ["rev-list", "--count", "HEAD", "^origin/HEAD"],
              { cwd },
            );
            const handle = yield* spawner.spawn(command);
            const output = yield* handle.stdout.pipe(
              Stream.decodeText(),
              Stream.runCollect,
              Effect.map((chunks) => chunks.join("")),
            );
            const exitCode = yield* handle.exitCode;
            if (exitCode !== 0) {
              return yield* new ShipGateFactsError({
                message: `git rev-list exited with ${exitCode}`,
              });
            }
            const count = Number.parseInt(output.trim(), 10);
            if (!Number.isFinite(count)) {
              return yield* new ShipGateFactsError({
                message: "git rev-list returned a non-numeric commit count",
              });
            }
            return count > 0;
          }),
        ).pipe(
          Effect.mapError((error) =>
            error instanceof ShipGateFactsError
              ? error
              : new ShipGateFactsError({ message: String(error) }),
          ),
        ),
    });
  }),
).pipe(Layer.provide(BunServicesLayer));
