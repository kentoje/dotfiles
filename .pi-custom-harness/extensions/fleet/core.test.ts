import { expect, test } from "bun:test";
import { Effect, Exit, Layer } from "effect";

import {
  FleetConfirmationService,
  FleetGitLabService,
  FleetGitService,
  FleetPackageService,
  type FleetPortlessServer,
  FleetPortlessService,
  FleetServiceError,
} from "../../lib/fleet/core";
import {
  RepoMapService,
  type RepositoryFacts,
  type RepositoryFleetEntry,
} from "../../lib/repo-map/core";
import { runFleetTool } from "./core";

const alphaRepository: RepositoryFleetEntry = {
  name: "alpha",
  path: "/fleet/alpha",
};
const betaRepository: RepositoryFleetEntry = {
  name: "beta",
  path: "/fleet/beta",
};
const repositories: ReadonlyArray<RepositoryFleetEntry> = [
  alphaRepository,
  betaRepository,
];

const facts: RepositoryFacts = {
  deliveryPolicy: { kind: "none", verification: { kind: "repository-wide" } },
  testRunner: "none",
  checks: [],
  devModes: [],
  setupScript: undefined,
  authMode: undefined,
  portlessAppName: "alpha",
  worktreeRoot: "/tmp/worktrees",
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
    appName: "alpha",
    url: "https://alpha.localhost",
  },
  repositories,
};

const repoMap = RepoMapService.of({
  repositoryFactsFor: () => Effect.succeed(facts),
});

const git = (overrides: Partial<typeof FleetGitService.Service> = {}) =>
  FleetGitService.of({
    statusFor: ({ repository }) =>
      Effect.succeed({
        branch: repository.name === "alpha" ? "feature/alpha" : "main",
        dirty: repository.name === "alpha",
        ahead: repository.name === "alpha" ? 2 : 0,
        behind: repository.name === "alpha" ? 1 : 3,
      }),
    syncPlanFor: ({ repository }) =>
      Effect.succeed({
        repository,
        branch: "feature",
        dirty: repository.name === "alpha",
        ahead: 1,
        behind: 2,
        pending:
          repository.name === "alpha" ? ["M src/index.ts", "ahead 1"] : [],
      }),
    syncHardFor: () => Effect.succeed(undefined),
    ...overrides,
  });

const packageService = (
  overrides: Partial<typeof FleetPackageService.Service> = {},
) =>
  FleetPackageService.of({
    versionFor: ({ repository }) =>
      Effect.succeed({
        repository,
        version: repository.name === "alpha" ? "^1.0.0" : "^2.0.0",
      }),
    installFor: () => Effect.succeed(undefined),
    ...overrides,
  });

type FleetEnvironment =
  | RepoMapService
  | FleetGitService
  | FleetGitLabService
  | FleetPackageService
  | FleetPortlessService
  | FleetConfirmationService;

const base = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, FleetEnvironment>> =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(RepoMapService, repoMap),
        Layer.succeed(FleetGitService, git()),
        Layer.succeed(FleetGitLabService, {
          openMergeRequestFor: ({ repository }) =>
            Effect.succeed(
              repository.name === "alpha"
                ? { iid: 4, state: "opened" }
                : undefined,
            ),
        }),
        Layer.succeed(FleetPackageService, packageService()),
        Layer.succeed(FleetPortlessService, {
          listOrphaned: () => Effect.succeed([]),
          remove: () => Effect.succeed(undefined),
        }),
        Layer.succeed(FleetConfirmationService, {
          confirm: () => Effect.succeed(false),
        }),
      ),
    ),
  );

test("fails closed when repository facts contain no repositories", async () => {
  const exit = await Effect.runPromiseExit(
    base(
      runFleetTool({ input: { action: "status" }, cwd: "/ignored" }).pipe(
        Effect.provideService(RepoMapService, {
          repositoryFactsFor: () =>
            Effect.succeed({ ...facts, repositories: [] }),
        }),
      ),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const reason = exit.cause.reasons[0];
    expect(reason).toMatchObject({
      _tag: "Fail",
      error: expect.objectContaining({
        _tag: "FleetRepositoryError",
        message:
          "Fleet repository selection failed: RepoMapService.repositoryFactsFor returned no repositories.",
      }),
    });
  }
});

test("status reports clean and dirty repositories and uses repo-map fleet entries", async () => {
  const result = await Effect.runPromise(
    base(runFleetTool({ input: { action: "status" }, cwd: "/ignored" })),
  );
  expect(result).toEqual({
    action: "status",
    repositories: [
      {
        repository: alphaRepository,
        branch: "feature/alpha",
        dirty: true,
        ahead: 2,
        behind: 1,
        openMergeRequest: { iid: 4, state: "opened" },
      },
      {
        repository: betaRepository,
        branch: "main",
        dirty: false,
        ahead: 0,
        behind: 3,
        openMergeRequest: undefined,
      },
    ],
  });
});

test("versions compares a named package across every mapped repository", async () => {
  const result = await Effect.runPromise(
    base(
      runFleetTool({
        input: { action: "versions", packageName: "tractor" },
        cwd: "/ignored",
      }),
    ),
  );
  expect(result).toEqual({
    action: "versions",
    packageName: "tractor",
    repositories: [
      { repository: alphaRepository, version: "^1.0.0" },
      { repository: betaRepository, version: "^2.0.0" },
    ],
  });
});

test("sync is a safe plan by default", async () => {
  let destructiveCalls = 0;
  const result = await Effect.runPromise(
    base(
      runFleetTool({ input: { action: "sync" }, cwd: "/ignored" }).pipe(
        Effect.provideService(
          FleetGitService,
          git({
            syncHardFor: () =>
              Effect.sync(() => {
                destructiveCalls += 1;
              }),
          }),
        ),
      ),
    ),
  );
  expect(result).toMatchObject({
    action: "sync",
    hard: false,
    applied: [],
    confirmed: false,
  });
  expect(destructiveCalls).toBe(0);
});

test("hard sync refuses without confirmation and executes after approval", async () => {
  let destructiveCalls = 0;
  const hardGit = git({
    syncHardFor: () =>
      Effect.sync(() => {
        destructiveCalls += 1;
      }),
  });
  const refusal = await Effect.runPromise(
    base(
      runFleetTool({
        input: { action: "sync", hard: true },
        cwd: "/ignored",
      }).pipe(
        Effect.provideService(FleetGitService, hardGit),
        Effect.provideService(FleetConfirmationService, {
          confirm: () => Effect.succeed(false),
        }),
      ),
    ),
  );
  expect(refusal).toMatchObject({ hard: true, confirmed: false, applied: [] });
  expect(destructiveCalls).toBe(0);

  const approval = await Effect.runPromise(
    base(
      runFleetTool({
        input: { action: "sync", hard: true },
        cwd: "/ignored",
      }).pipe(
        Effect.provideService(FleetGitService, hardGit),
        Effect.provideService(FleetConfirmationService, {
          confirm: () => Effect.succeed(true),
        }),
      ),
    ),
  );
  expect(approval).toMatchObject({
    hard: true,
    confirmed: true,
    applied: ["alpha", "beta"],
  });
  expect(destructiveCalls).toBe(2);
});

test("install attempts every repository and aggregates partial failures", async () => {
  const result = await Effect.runPromise(
    base(
      runFleetTool({ input: { action: "install" }, cwd: "/ignored" }).pipe(
        Effect.provideService(
          FleetPackageService,
          packageService({
            installFor: ({ repository }) =>
              repository.name === "alpha"
                ? Effect.fail(
                    new FleetServiceError({ message: "lockfile mismatch" }),
                  )
                : Effect.succeed(undefined),
          }),
        ),
      ),
    ),
  );
  expect(result).toEqual({
    action: "install",
    installed: ["beta"],
    failures: [{ repository: alphaRepository, message: "lockfile mismatch" }],
  });
});

test("prune removes only servers identified as orphaned by the service", async () => {
  const orphan: FleetPortlessServer = {
    name: "old-alpha",
    worktreePath: "/gone/alpha",
  };
  const removed: string[] = [];
  const result = await Effect.runPromise(
    base(
      runFleetTool({ input: { action: "prune" }, cwd: "/ignored" }).pipe(
        Effect.provideService(FleetPortlessService, {
          listOrphaned: () => Effect.succeed([orphan]),
          remove: ({ server }) =>
            Effect.sync(() => {
              removed.push(server.name);
            }),
        }),
      ),
    ),
  );
  expect(removed).toEqual(["old-alpha"]);
  expect(result).toMatchObject({
    action: "prune",
    removed: [orphan],
    failures: [],
  });
});
