import { expect, test } from "bun:test";
import { Effect, Exit } from "effect";

import {
  PreviewModeUnavailableError,
  PreviewPortlessError,
  PreviewPortlessService,
  PreviewProcessService,
  PreviewRouteNotReadyError,
  type PreviewRouteStatus,
  PreviewStartupError,
} from "../../lib/preview/core";
import { RepoMapService, type RepositoryFacts } from "../../lib/repo-map/core";
import { runPreview, selectPreviewMode } from "./core";

const facts = (overrides: Partial<RepositoryFacts> = {}): RepositoryFacts => ({
  deliveryPolicy: { kind: "none", verification: { kind: "repository-wide" } },
  testRunner: "none",
  checks: [],
  devModes: ["dev", "dev:integrate", "dev:mock"],
  setupScript: undefined,
  authMode: "browser-login",
  portlessAppName: "app",
  worktreeRoot: "~/.pi/worktrees",
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
    appName: "app",
    url: "https://app.localhost",
  },
  repositories: [],
  ...overrides,
});

const run = (
  request: Parameters<typeof runPreview>[0]["request"],
  repositoryFacts: RepositoryFacts,
  routes: ReadonlyArray<PreviewRouteStatus>,
  start: (
    input: Parameters<PreviewProcessService["Service"]["start"]>[0],
  ) => Effect.Effect<void, never> = () => Effect.void,
) => {
  let routeIndex = 0;
  return Effect.runPromise(
    runPreview({ cwd: "/worktree", request }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(repositoryFacts),
      }),
      Effect.provideService(PreviewPortlessService, {
        resolveRoute: () => {
          const route = routes[Math.min(routeIndex++, routes.length - 1)];
          return route === undefined
            ? Effect.fail(
                new PreviewPortlessError({
                  message: "Preview test route is missing.",
                }),
              )
            : Effect.succeed(route);
        },
      }),
      Effect.provideService(PreviewProcessService, {
        start: (input) =>
          start(input).pipe(Effect.map(() => ({ stop: () => Effect.void }))),
        stopAll: () => Effect.void,
      }),
    ),
  );
};

test("selects sandbox, integrate, and mock only when exposed", () => {
  expect(selectPreviewMode(undefined, facts())).toBe("sandbox");
  expect(selectPreviewMode("integrate", facts())).toBe("integrate");
  expect(selectPreviewMode("mock", facts())).toBe("mock");
  expect(
    selectPreviewMode("mock", facts({ devModes: ["dev"] })),
  ).toBeInstanceOf(PreviewModeUnavailableError);
  expect(selectPreviewMode("other", facts())).toBeInstanceOf(
    PreviewModeUnavailableError,
  );
});

test("url requires a ready current-worktree route and reports browser-login", async () => {
  const result = await run({ action: "url" }, facts(), [
    {
      url: "https://app.localhost",
      routeName: "app",
      ready: true,
      running: true,
    },
  ]);
  expect(result).toEqual({
    url: "https://app.localhost",
    running: true,
    authMode: "browser-login",
    mode: undefined,
  });
});

test("url rejects a registered but unready route", async () => {
  const exit = await Effect.runPromiseExit(
    runPreview({ cwd: "/worktree", request: { action: "url" } }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(facts()),
      }),
      Effect.provideService(PreviewPortlessService, {
        resolveRoute: () =>
          Effect.succeed({
            url: "https://app.localhost",
            routeName: "app",
            ready: false,
            running: false,
          }),
      }),
      Effect.provideService(PreviewProcessService, {
        start: () => Effect.succeed({ stop: () => Effect.void }),
        stopAll: () => Effect.void,
      }),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(exit.cause.reasons[0]).toMatchObject({
      _tag: "Fail",
      error: expect.any(PreviewRouteNotReadyError),
    });
  }
});

test("up returns an already-running server without starting a command", async () => {
  let starts = 0;
  const result = await run(
    { action: "up", mode: "mock" },
    facts(),
    [
      {
        url: "https://app.localhost",
        routeName: "app",
        ready: true,
        running: true,
      },
    ],
    () => {
      starts += 1;
      return Effect.void;
    },
  );
  expect(starts).toBe(0);
  expect(result.mode).toBe("mock");
});

test("up starts exactly the selected repository command and reports readiness", async () => {
  let command: ReadonlyArray<string> = [];
  const result = await run(
    { action: "up", mode: "integrate" },
    facts(),
    [
      {
        url: "https://app.localhost",
        routeName: "app",
        ready: false,
        running: false,
      },
      {
        url: "https://app.localhost",
        routeName: "app",
        ready: true,
        running: true,
      },
    ],
    (input) => {
      command = [input.program, ...input.arguments_];
      return Effect.void;
    },
  );
  expect(command).toEqual([
    "portless",
    "run",
    "app",
    "pnpm",
    "run",
    "dev:integrate",
  ]);
  expect(result).toMatchObject({ running: true, mode: "integrate" });
});

test("up reports startup failure when the route remains down", async () => {
  const exit = await Effect.runPromiseExit(
    runPreview({
      cwd: "/worktree",
      request: { action: "up", mode: "sandbox" },
    }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(facts()),
      }),
      Effect.provideService(PreviewPortlessService, {
        resolveRoute: () =>
          Effect.succeed({
            url: "https://app.localhost",
            routeName: "app",
            ready: false,
            running: false,
          }),
      }),
      Effect.provideService(PreviewProcessService, {
        start: () => Effect.succeed({ stop: () => Effect.void }),
        stopAll: () => Effect.void,
      }),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(exit.cause.reasons[0]).toMatchObject({
      _tag: "Fail",
      error: expect.any(PreviewStartupError),
    });
  }
});

test("up reports a typed startup failure after route readiness without running", async () => {
  const exit = await Effect.runPromiseExit(
    runPreview({
      cwd: "/worktree",
      request: { action: "up", mode: "sandbox" },
    }).pipe(
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(facts()),
      }),
      Effect.provideService(PreviewPortlessService, {
        resolveRoute: () =>
          Effect.succeed({
            url: "https://app.localhost",
            routeName: "app",
            ready: true,
            running: false,
          }),
      }),
      Effect.provideService(PreviewProcessService, {
        start: () => Effect.succeed({ stop: () => Effect.void }),
        stopAll: () => Effect.void,
      }),
    ),
  );
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    expect(exit.cause.reasons[0]).toMatchObject({
      _tag: "Fail",
      error: expect.any(PreviewStartupError),
    });
  }
});
