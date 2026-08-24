import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type VerifyCheckRequest,
  VerifyCommandExecutionError,
  type VerifyCommandRequest,
  type VerifyCommandResult,
  VerifyCommandService,
  type VerifyFocusedTestPackage,
  VerifyFocusedTestPackageError,
  type VerifyFocusedTestPackageRequest,
  type VerifyProgramRequest,
} from "./core";

export type { VerifyCommandRequest, VerifyCommandResult };

const describeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Transport seam used by the live command layer and deterministic core tests. */
export type VerifyCommandTransport = (
  request: VerifyCommandRequest,
) => Effect.Effect<VerifyCommandResult, unknown>;

const PackageMetadata = Schema.Struct({
  scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  devDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  optionalDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});
type PackageMetadataValue = Schema.Schema.Type<typeof PackageMetadata>;
const decodePackageMetadata = Schema.decodeUnknownEffect(PackageMetadata);

const hasDependency = (
  metadata: PackageMetadataValue,
  name: "vitest" | "jest",
): boolean =>
  name in (metadata.dependencies ?? {}) ||
  name in (metadata.devDependencies ?? {}) ||
  name in (metadata.optionalDependencies ?? {});

const runnerFor = (
  metadata: PackageMetadataValue,
): VerifyFocusedTestPackage["runner"] | undefined => {
  const script = metadata.scripts?.test ?? "";
  if (
    hasDependency(metadata, "vitest") ||
    /(?:^|[\s/&])vitest(?:$|[\s@])/.test(script)
  ) {
    return "vitest";
  }
  if (
    hasDependency(metadata, "jest") ||
    /(?:^|[\s/&])jest(?:$|[\s@])/.test(script)
  ) {
    return "jest";
  }
  return undefined;
};

const makeVerifyCommandService = (
  transport: VerifyCommandTransport,
  focusedTestPackageFor: VerifyCommandService["Service"]["focusedTestPackageFor"],
): VerifyCommandService["Service"] => {
  const run = Effect.fn("VerifyCommandService.runCommand")(function* (
    request: VerifyProgramRequest,
  ) {
    return yield* transport(request).pipe(
      Effect.mapError(
        (cause) =>
          new VerifyCommandExecutionError({
            message: `verification command failed to start: ${describeFailure(cause)}`,
          }),
      ),
    );
  });

  const runCheck = Effect.fn("VerifyCommandService.runCheck")(function* (
    request: VerifyCheckRequest,
  ) {
    return yield* run({
      cwd: request.cwd,
      program: "pnpm",
      args: ["run", request.check],
    });
  });

  return VerifyCommandService.of({
    runCheck,
    runCommand: run,
    focusedTestPackageFor,
  });
};

/** Builds a command service from an injected transport for deterministic tests. */
export const VerifyCommandLiveLayerWithTransport = (
  transport: VerifyCommandTransport,
): Layer.Layer<VerifyCommandService> =>
  Layer.succeed(
    VerifyCommandService,
    makeVerifyCommandService(transport, () =>
      Effect.fail(
        new VerifyFocusedTestPackageError({
          message:
            "Focused test package discovery is unavailable in the transport test layer.",
        }),
      ),
    ),
  );

const mapDiscoveryFailure = (cause: unknown): VerifyFocusedTestPackageError =>
  new VerifyFocusedTestPackageError({
    message: `focused test package discovery failed: ${describeFailure(cause)}`,
  });

const makeFocusedTestPackageFor = (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
): VerifyCommandService["Service"]["focusedTestPackageFor"] =>
  Effect.fn("VerifyCommandService.focusedTestPackageFor")(function* ({
    file,
    workspaceRoot,
  }: VerifyFocusedTestPackageRequest) {
    const root = path.resolve(workspaceRoot);
    const absoluteFile = path.resolve(root, file);
    const relative = path.relative(root, absoluteFile);
    if (
      relative.startsWith(`..${path.sep}`) ||
      relative === ".." ||
      path.isAbsolute(relative)
    ) {
      return yield* new VerifyFocusedTestPackageError({
        message: `Focused test file is outside the repository workspace: ${file}`,
      });
    }

    let directory = path.dirname(absoluteFile);
    while (true) {
      const packageJsonPath = path.join(directory, "package.json");
      const exists = yield* fileSystem
        .exists(packageJsonPath)
        .pipe(Effect.mapError(mapDiscoveryFailure));
      if (exists) {
        const metadataText = yield* fileSystem
          .readFileString(packageJsonPath)
          .pipe(Effect.mapError(mapDiscoveryFailure));
        const metadataUnknown = yield* Effect.try({
          try: (): unknown => JSON.parse(metadataText),
          catch: mapDiscoveryFailure,
        });
        const metadata = yield* decodePackageMetadata(metadataUnknown).pipe(
          Effect.mapError(mapDiscoveryFailure),
        );
        const testScript = metadata.scripts?.test;
        const runner = runnerFor(metadata);
        if (testScript === undefined || runner === undefined) {
          return yield* new VerifyFocusedTestPackageError({
            message: `Package at ${directory} does not define a supported test script.`,
          });
        }
        return {
          packageRoot: directory,
          relativeFile: path.relative(directory, absoluteFile),
          runner,
        };
      }
      if (directory === root) {
        break;
      }
      directory = path.dirname(directory);
    }
    return yield* new VerifyFocusedTestPackageError({
      message: `No package.json found for focused test file: ${file}`,
    });
  });

/** Runs repository check scripts and exact focused commands with complete output. */
export const VerifyCommandLiveLayer = Layer.effect(
  VerifyCommandService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const transport: VerifyCommandTransport = (request) =>
      Effect.scoped(
        Effect.gen(function* () {
          const command =
            "program" in request
              ? ChildProcess.make(request.program, request.args, {
                  cwd: request.cwd,
                })
              : ChildProcess.make("pnpm", ["run", request.check], {
                  cwd: request.cwd,
                });
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.all.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;
          return { exitCode, output };
        }),
      );

    return makeVerifyCommandService(
      transport,
      makeFocusedTestPackageFor(fileSystem, path),
    );
  }),
).pipe(Layer.provide(BunServicesLayer));
