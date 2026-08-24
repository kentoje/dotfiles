import { Context, type Effect, Schema } from "effect";

import type {
  RepositoryFacts,
  RepositoryPortlessRouteConfiguration,
} from "../repo-map/core";

/** A route status returned by the narrow portless preview seam. */
export interface PreviewRouteStatus {
  readonly url: string;
  readonly ready: boolean;
  readonly running: boolean;
  readonly routeName: string;
}

/** A command passed to the preview process seam after mode selection. */
export interface PreviewProcessCommand {
  readonly program: string;
  readonly arguments_: ReadonlyArray<string>;
  readonly cwd: string;
  readonly routeName: string;
  readonly signal?: AbortSignal;
}

/** A started development process that can be stopped during session cleanup. */
export interface PreviewProcessHandle {
  readonly stop: () => Effect.Effect<void, PreviewProcessError>;
}

/** Portless could not resolve or validate the current worktree route. */
export class PreviewPortlessError extends Schema.TaggedError<PreviewPortlessError>()(
  "PreviewPortlessError",
  { message: Schema.String },
) {}

/** The current worktree route was not ready to serve a preview. */
export class PreviewRouteNotReadyError extends Schema.TaggedError<PreviewRouteNotReadyError>()(
  "PreviewRouteNotReadyError",
  { message: Schema.String, url: Schema.String },
) {}

/** The selected repository development process could not be started or stopped. */
export class PreviewProcessError extends Schema.TaggedError<PreviewProcessError>()(
  "PreviewProcessError",
  { message: Schema.String },
) {}

/** A selected preview mode is not exposed by the repository facts. */
export class PreviewModeUnavailableError extends Schema.TaggedError<PreviewModeUnavailableError>()(
  "PreviewModeUnavailableError",
  { message: Schema.String, mode: Schema.String },
) {}

/** Starting the selected development command did not make its route ready. */
export class PreviewStartupError extends Schema.TaggedError<PreviewStartupError>()(
  "PreviewStartupError",
  { message: Schema.String, url: Schema.String },
) {}

/** The typed portless seam only resolves the current worktree route. */
export class PreviewPortlessService extends Context.Service<
  PreviewPortlessService,
  {
    readonly resolveRoute: (input: {
      readonly cwd: string;
      readonly facts: RepositoryFacts;
    }) => Effect.Effect<PreviewRouteStatus, PreviewPortlessError>;
  }
>()("pi-custom-harness/lib/preview/PreviewPortlessService") {}

/** The typed process seam starts exactly one portless-wrapped repository command. */
export class PreviewProcessService extends Context.Service<
  PreviewProcessService,
  {
    readonly start: (
      input: PreviewProcessCommand,
    ) => Effect.Effect<PreviewProcessHandle, PreviewProcessError>;
    readonly stopAll: () => Effect.Effect<void, PreviewProcessError>;
  }
>()("pi-custom-harness/lib/preview/PreviewProcessService") {}

/** Builds the URL shape used by a current-worktree portless route. */
export const previewRouteUrl = (
  route: RepositoryPortlessRouteConfiguration,
  routeName: string,
): string => `${route.protocol}://${routeName}${route.hostSuffix}`;
