import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  RepositoryReleaseGateLookupError,
  RepoMapService,
} from "./core";

const PackageJsonReleaseDependencies = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  devDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});
const decodePackageJsonReleaseDependencies = Schema.decodeUnknownEffect(
  PackageJsonReleaseDependencies,
);

/** Detects the release artifact required by the Git repository containing a working directory. */
export const RepoMapLiveLayer = Layer.effect(
  RepoMapService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const releaseGateFor = Effect.fn("RepoMapService.releaseGateFor")(function* ({
      cwd,
    }: {
      readonly cwd: string;
    }) {
      const repositoryRoot = yield* Effect.scoped(
        Effect.gen(function* () {
          const command = ChildProcess.make(
            "git",
            ["rev-parse", "--show-toplevel"],
            { cwd },
          );
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.stdout.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;

          if (exitCode !== 0) {
            return yield* new RepositoryReleaseGateLookupError({
              message: `Repository release gate lookup failed: git rev-parse exited with ${exitCode}`,
            });
          }

          return output.trim();
        }),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new RepositoryReleaseGateLookupError({
              message: `Repository release gate lookup failed: ${cause.message}`,
            }),
        ),
      );
      const changesetDirectory = path.join(repositoryRoot, ".changeset");

      if (yield* fileSystem.exists(changesetDirectory)) {
        return "changeset" as const;
      }

      const packageJsonPath = path.join(repositoryRoot, "package.json");
      if (!(yield* fileSystem.exists(packageJsonPath))) {
        return "none" as const;
      }

      const packageJsonText = yield* fileSystem.readFileString(packageJsonPath);
      const packageJson = yield* Effect.try({
        try: () => JSON.parse(packageJsonText),
        catch: (cause) =>
          new RepositoryReleaseGateLookupError({
            message: `Repository release gate lookup failed: ${String(cause)}`,
          }),
      });
      const packageJsonDependencies = yield* decodePackageJsonReleaseDependencies(
        packageJson,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new RepositoryReleaseGateLookupError({
              message: `Repository release gate lookup failed: ${cause.message}`,
            }),
        ),
      );

      if (
        "semantic-release" in (packageJsonDependencies.dependencies ?? {}) ||
        "semantic-release" in (packageJsonDependencies.devDependencies ?? {})
      ) {
        return "conventional-commits" as const;
      }

      return "none" as const;
    });

    return RepoMapService.of({ releaseGateFor });
  }),
).pipe(Layer.provide(BunServicesLayer));
