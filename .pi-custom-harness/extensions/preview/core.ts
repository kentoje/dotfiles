import { Effect } from "effect";

import {
  PreviewModeUnavailableError,
  PreviewPortlessError,
  PreviewPortlessService,
  type PreviewProcessError,
  PreviewProcessService,
  PreviewRouteNotReadyError,
  type PreviewRouteStatus,
  PreviewStartupError,
} from "../../lib/preview/core";
import {
  RepoMapService,
  type RepositoryAuthMode,
  type RepositoryDevMode,
  type RepositoryFacts,
} from "../../lib/repo-map/core";
import type { PreviewInput } from "./schema";

/** The user-facing preview modes; each maps to a repository-exposed dev script. */
export type PreviewMode = "sandbox" | "integrate" | "mock";

/** The result shared by URL lookup and server startup actions. */
export interface PreviewReport {
  readonly url: string;
  readonly running: boolean;
  readonly authMode: RepositoryAuthMode | undefined;
  readonly mode: PreviewMode | undefined;
}

/** Errors produced by preview policy or its narrow live service seams. */
export type PreviewError =
  | PreviewPortlessError
  | PreviewRouteNotReadyError
  | PreviewProcessError
  | PreviewModeUnavailableError
  | PreviewStartupError;

const modeScript: Readonly<Record<PreviewMode, RepositoryDevMode>> = {
  sandbox: "dev",
  integrate: "dev:integrate",
  mock: "dev:mock",
};

const modeOrder: ReadonlyArray<PreviewMode> = ["sandbox", "integrate", "mock"];

/** Selects a normalized preview mode only when its repository dev script is exposed. */
export const selectPreviewMode = (
  requestedMode: string | undefined,
  facts: RepositoryFacts,
): PreviewMode | PreviewModeUnavailableError => {
  if (requestedMode !== undefined) {
    if (
      requestedMode !== "sandbox" &&
      requestedMode !== "integrate" &&
      requestedMode !== "mock"
    ) {
      return new PreviewModeUnavailableError({
        message: `Preview mode is unknown: ${requestedMode}`,
        mode: requestedMode,
      });
    }
    const script = modeScript[requestedMode];
    if (!facts.devModes.includes(script)) {
      return new PreviewModeUnavailableError({
        message: `Preview mode is not exposed by this repository: ${requestedMode}`,
        mode: requestedMode,
      });
    }
    return requestedMode;
  }

  for (const mode of modeOrder) {
    if (facts.devModes.includes(modeScript[mode])) return mode;
  }
  return new PreviewModeUnavailableError({
    message: "Preview mode sandbox is not exposed by this repository.",
    mode: "sandbox",
  });
};

const repositoryFactsFor = Effect.fn("preview.repositoryFactsFor")(function* ({
  cwd,
}: {
  readonly cwd: string;
}) {
  const repoMap = yield* RepoMapService;
  if (repoMap.repositoryFactsFor === undefined) {
    return yield* new PreviewPortlessError({
      message: "Preview repository facts lookup is unavailable.",
    });
  }
  return yield* repoMap.repositoryFactsFor({ cwd });
});
const checkedRouteUrl = (
  route: PreviewRouteStatus,
  facts: RepositoryFacts,
): Effect.Effect<PreviewRouteStatus, PreviewPortlessError> => {
  if (route.routeName.length === 0) {
    return Effect.fail(
      new PreviewPortlessError({
        message: "Preview portless route name is empty.",
      }),
    );
  }
  const expectedUrl = `${facts.portlessRoute.protocol}://${route.routeName}${facts.portlessRoute.hostSuffix}`;
  try {
    const expected = new URL(expectedUrl);
    const actual = new URL(route.url);
    if (
      actual.protocol !== expected.protocol ||
      actual.host !== expected.host ||
      actual.pathname !== expected.pathname ||
      actual.search !== expected.search
    ) {
      return Effect.fail(
        new PreviewPortlessError({
          message: `Preview portless URL does not match current worktree route: ${route.url}`,
        }),
      );
    }
  } catch {
    return Effect.fail(
      new PreviewPortlessError({
        message: `Preview portless URL is invalid: ${route.url}`,
      }),
    );
  }
  return Effect.succeed(route);
};

const requireReadyRoute = (
  route: PreviewRouteStatus,
): Effect.Effect<PreviewRouteStatus, PreviewRouteNotReadyError> =>
  route.ready
    ? Effect.succeed(route)
    : Effect.fail(
        new PreviewRouteNotReadyError({
          message: `Preview route is not ready: ${route.url}`,
          url: route.url,
        }),
      );

const report = (
  facts: RepositoryFacts,
  route: PreviewRouteStatus,
  mode: PreviewMode | undefined,
): PreviewReport => ({
  url: route.url,
  running: route.running,
  authMode: facts.authMode,
  mode,
});

/** Resolves the current worktree route, or starts its selected repository dev command. */
export const runPreview = Effect.fn("runPreview")(function* ({
  cwd,
  request,
  sessionSignal,
}: {
  readonly cwd: string;
  readonly request: PreviewInput;
  readonly sessionSignal?: AbortSignal;
}) {
  const facts = yield* repositoryFactsFor({ cwd });
  const selectedMode =
    request.action === "up"
      ? selectPreviewMode(request.mode, facts)
      : undefined;
  if (selectedMode instanceof PreviewModeUnavailableError)
    return yield* selectedMode;

  const portless = yield* PreviewPortlessService;
  const initialRoute = yield* portless.resolveRoute({ cwd, facts });
  yield* checkedRouteUrl(initialRoute, facts);

  if (request.action === "url") {
    const readyRoute = yield* requireReadyRoute(initialRoute);
    return report(facts, readyRoute, undefined);
  }

  if (selectedMode === undefined) {
    return yield* new PreviewStartupError({
      message: "Preview startup mode was not selected.",
      url: initialRoute.url,
    });
  }

  if (initialRoute.running) {
    const readyRoute = yield* requireReadyRoute(initialRoute);
    return report(facts, readyRoute, selectedMode);
  }

  const process = yield* PreviewProcessService;
  yield* process.start({
    program: "portless",
    arguments_: [
      "run",
      initialRoute.routeName,
      "pnpm",
      "run",
      modeScript[selectedMode],
    ],
    cwd,
    routeName: initialRoute.routeName,
    signal: sessionSignal,
  });

  const startedRoute = yield* portless.resolveRoute({ cwd, facts });
  yield* checkedRouteUrl(startedRoute, facts);
  if (!startedRoute.ready || !startedRoute.running) {
    return yield* new PreviewStartupError({
      message: `Preview server did not become ready: ${startedRoute.url}`,
      url: startedRoute.url,
    });
  }
  return report(facts, startedRoute, selectedMode);
});
