import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  DefaultRepositoryFactsConfiguration,
  RepoMapService,
  type RepositoryCheck,
  type RepositoryDeliveryPolicy,
  type RepositoryDeliveryPolicyOverride,
  type RepositoryDevMode,
  type RepositoryFacts,
  type RepositoryFactsInput,
  RepositoryFactsLookupError,
  type RepositoryTestRunner,
  type RepositoryVerificationPolicy,
} from "./core";

const PackageMetadata = Schema.Struct({
  name: Schema.optional(Schema.String),
  scripts: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  devDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  optionalDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  peerDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});
const decodePackageMetadata = Schema.decodeUnknownEffect(PackageMetadata);

const checkNames = [
  "ts:check",
  "biome:check",
  "test",
  "graphql:check",
  "fallow",
] as const satisfies ReadonlyArray<RepositoryCheck>;

const devModeNames = [
  "dev",
  "dev:integrate",
  "dev:mock",
] as const satisfies ReadonlyArray<RepositoryDevMode>;

const setupScriptPaths = [
  "scripts/setup-worktree.sh",
  "scripts/new-worktree.sh",
  "scripts/setup.sh",
] as const;

const repositoryPackageNames = ["vitest", "jest"] as const;

type PackageMetadataValue = Schema.Schema.Type<typeof PackageMetadata>;

const hasDependency = (
  packageMetadata: PackageMetadataValue,
  dependencyName: string,
): boolean =>
  dependencyName in (packageMetadata.dependencies ?? {}) ||
  dependencyName in (packageMetadata.devDependencies ?? {}) ||
  dependencyName in (packageMetadata.optionalDependencies ?? {}) ||
  dependencyName in (packageMetadata.peerDependencies ?? {});

const scriptMentions = (
  packageMetadata: PackageMetadataValue,
  scriptName: string,
): boolean => packageMetadata.scripts?.[scriptName] !== undefined;

const inferTestRunner = (
  packageMetadata: PackageMetadataValue,
): RepositoryTestRunner => {
  for (const runner of repositoryPackageNames) {
    const runnerCommand = new RegExp(`(?:^|[\\s/&])${runner}(?:$|[\\s@])`);
    const scriptUsesRunner = Object.values(packageMetadata.scripts ?? {}).some(
      (script) => runnerCommand.test(script),
    );
    if (hasDependency(packageMetadata, runner) || scriptUsesRunner) {
      return runner;
    }
  }
  return "none";
};

const inferChecks = (
  packageMetadata: PackageMetadataValue,
): ReadonlyArray<RepositoryCheck> =>
  checkNames.filter((checkName) => scriptMentions(packageMetadata, checkName));

const inferDevModes = (
  packageMetadata: PackageMetadataValue,
): ReadonlyArray<RepositoryDevMode> =>
  devModeNames.filter((modeName) => scriptMentions(packageMetadata, modeName));

const findConfiguredValue = <Value>(
  values: Readonly<Record<string, Value>>,
  repositoryRoot: string,
  repositoryName: string,
  packageName: string | undefined,
): Value | undefined =>
  values[repositoryRoot] ??
  values[repositoryName] ??
  (packageName === undefined ? undefined : values[packageName]);

const deliveryPolicyFor = (input: {
  readonly override: RepositoryDeliveryPolicyOverride | undefined;
  readonly changesetDirectoryExists: boolean;
  readonly hasSemanticRelease: boolean;
  readonly repositoryRoot: string;
  readonly inferredVerification: RepositoryVerificationPolicy;
}): RepositoryDeliveryPolicy => {
  const verificationKind =
    input.override?.verification ?? input.inferredVerification.kind;
  const verification: RepositoryVerificationPolicy =
    verificationKind === "focused-only"
      ? { kind: "focused-only", workspaceRoot: input.repositoryRoot }
      : { kind: "repository-wide" };
  const release =
    input.override?.release ??
    (input.changesetDirectoryExists
      ? "changesets"
      : input.hasSemanticRelease
        ? "conventional-commits"
        : "none");

  switch (release) {
    case "changesets":
      return {
        kind: "changesets",
        verification,
        changesetApplicability: { kind: "publishable-packages" },
      };
    case "conventional-commits":
      return { kind: "conventional-commits", verification };
    case "none":
      return { kind: "none", verification };
    default: {
      const _exhaustive: never = release;
      return _exhaustive;
    }
  }
};

const mapLookupFailure = (cause: unknown): RepositoryFactsLookupError => {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new RepositoryFactsLookupError({
    message: `Repository facts lookup failed: ${message}`,
  });
};

/** Detects repository facts from package metadata and one explicit configuration source. */
export const RepoMapLiveLayer = Layer.effect(
  RepoMapService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const runGitRoot = Effect.fn("RepoMapService.runGitRoot")(function* ({
      cwd,
    }: {
      readonly cwd: string;
    }) {
      const command = ChildProcess.make(
        "git",
        ["rev-parse", "--show-toplevel"],
        {
          cwd,
        },
      );
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.stdout.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;
          return { exitCode, output };
        }),
      ).pipe(Effect.mapError(mapLookupFailure));

      const repositoryRoot = result.output.trim();
      if (result.exitCode !== 0 || repositoryRoot.length === 0) {
        return yield* new RepositoryFactsLookupError({
          message: `Repository facts lookup failed: git rev-parse exited with ${result.exitCode}`,
        });
      }
      return repositoryRoot;
    });

    const readPackageMetadata = Effect.fn("RepoMapService.readPackageMetadata")(
      function* ({ repositoryRoot }: { readonly repositoryRoot: string }) {
        const packageJsonPath = path.join(repositoryRoot, "package.json");
        const packageJsonExists = yield* fileSystem
          .exists(packageJsonPath)
          .pipe(Effect.mapError(mapLookupFailure));
        if (!packageJsonExists) {
          return undefined;
        }

        const packageJsonText = yield* fileSystem
          .readFileString(packageJsonPath)
          .pipe(Effect.mapError(mapLookupFailure));
        const packageJson = yield* Effect.try({
          try: (): unknown => JSON.parse(packageJsonText),
          catch: (cause) => mapLookupFailure(cause),
        });
        return yield* decodePackageMetadata(packageJson).pipe(
          Effect.mapError((cause) => mapLookupFailure(cause)),
        );
      },
    );

    const repositoryFactsFor = Effect.fn("RepoMapService.repositoryFactsFor")(
      function* ({
        cwd,
        configuration = DefaultRepositoryFactsConfiguration,
      }: RepositoryFactsInput) {
        const repositoryRoot = yield* runGitRoot({ cwd });
        const repositoryName = path.basename(repositoryRoot);
        const packageMetadata = yield* readPackageMetadata({ repositoryRoot });
        const packageName = packageMetadata?.name;

        const changesetDirectoryExists = yield* fileSystem
          .exists(path.join(repositoryRoot, ".changeset"))
          .pipe(Effect.mapError(mapLookupFailure));
        const pnpmWorkspaceExists = yield* fileSystem
          .exists(path.join(repositoryRoot, "pnpm-workspace.yaml"))
          .pipe(Effect.mapError(mapLookupFailure));
        const rootTestScript = packageMetadata?.scripts?.test;
        const inferredVerification: RepositoryVerificationPolicy =
          pnpmWorkspaceExists && rootTestScript?.trimStart().startsWith("turbo")
            ? { kind: "focused-only", workspaceRoot: repositoryRoot }
            : { kind: "repository-wide" };
        const deliveryPolicy = deliveryPolicyFor({
          override: findConfiguredValue(
            configuration.deliveryPolicyOverrides,
            repositoryRoot,
            repositoryName,
            packageName,
          ),
          changesetDirectoryExists,
          hasSemanticRelease:
            packageMetadata !== undefined &&
            hasDependency(packageMetadata, "semantic-release"),
          repositoryRoot,
          inferredVerification,
        });

        const portlessAppName =
          findConfiguredValue(
            configuration.portlessAppNameOverrides,
            repositoryRoot,
            repositoryName,
            packageName,
          ) ?? repositoryName;
        const authMode = findConfiguredValue(
          configuration.authModeOverrides,
          repositoryRoot,
          repositoryName,
          packageName,
        );
        const portlessUrl = `${configuration.portlessRoute.protocol}://${portlessAppName}${configuration.portlessRoute.hostSuffix}`;
        let setupScript: string | undefined;
        for (const setupScriptPath of setupScriptPaths) {
          if (
            yield* fileSystem
              .exists(path.join(repositoryRoot, setupScriptPath))
              .pipe(Effect.mapError(mapLookupFailure))
          ) {
            setupScript = setupScriptPath;
            break;
          }
        }

        const facts: RepositoryFacts = {
          deliveryPolicy,
          testRunner:
            packageMetadata === undefined
              ? "none"
              : inferTestRunner(packageMetadata),
          checks:
            packageMetadata === undefined ? [] : inferChecks(packageMetadata),
          devModes:
            packageMetadata === undefined ? [] : inferDevModes(packageMetadata),
          setupScript,
          authMode,
          portlessAppName,
          worktreeRoot: configuration.worktreeRoot,
          portlessRoute: {
            ...configuration.portlessRoute,
            appName: portlessAppName,
            url: portlessUrl,
          },
          repositories: configuration.repositories,
        };
        return facts;
      },
    );

    return RepoMapService.of({ repositoryFactsFor });
  }),
).pipe(Layer.provide(BunServicesLayer));
