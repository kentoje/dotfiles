import { Context, type Effect, Schema } from "effect";

import type { RepositoryFleetEntry } from "../repo-map/core";

/** Git facts used by the fleet status action. */
export interface FleetGitStatus {
  readonly branch: string;
  readonly dirty: boolean;
  readonly ahead: number;
  readonly behind: number;
}

/** A pending change that safe sync reports and hard sync may discard. */
export interface FleetSyncPlan {
  readonly repository: RepositoryFleetEntry;
  readonly branch: string;
  readonly dirty: boolean;
  readonly ahead: number;
  readonly behind: number;
  readonly pending: ReadonlyArray<string>;
}

/** Version value for a package in one repository. */
export interface FleetVersion {
  readonly repository: RepositoryFleetEntry;
  readonly version: string | undefined;
}

/** Open merge request state for a fleet repository. */
export interface OpenMergeRequest {
  readonly iid: number;
  readonly state: string;
  readonly title?: string;
  readonly webUrl?: string;
}

/** A running portless server that no longer belongs to an active worktree. */
export interface FleetPortlessServer {
  readonly name: string;
  readonly url?: string;
  readonly worktreePath?: string;
}

/** An install failure is retained while installation continues for the rest of the fleet. */
export interface FleetInstallFailure {
  readonly repository: RepositoryFleetEntry;
  readonly message: string;
}

/** Common failure from fleet service boundaries. */
export class FleetServiceError extends Schema.TaggedError<FleetServiceError>()(
  "FleetServiceError",
  { message: Schema.String },
) {}

/** Failure selecting repositories from RepoMapService. */
export class FleetRepositoryError extends Schema.TaggedError<FleetRepositoryError>()(
  "FleetRepositoryError",
  { message: Schema.String },
) {}

/** Git state and mutation seam used by fleet policy. */
export class FleetGitService extends Context.Service<
  FleetGitService,
  {
    readonly statusFor: (input: {
      readonly repository: RepositoryFleetEntry;
    }) => Effect.Effect<FleetGitStatus, FleetServiceError>;
    readonly syncPlanFor: (input: {
      readonly repository: RepositoryFleetEntry;
    }) => Effect.Effect<FleetSyncPlan, FleetServiceError>;
    readonly syncHardFor: (input: {
      readonly repository: RepositoryFleetEntry;
    }) => Effect.Effect<void, FleetServiceError>;
  }
>()("pi-custom-harness/lib/fleet/FleetGitService") {}

/** GitLab read seam for open merge request state. */
export class FleetGitLabService extends Context.Service<
  FleetGitLabService,
  {
    readonly openMergeRequestFor: (input: {
      readonly repository: RepositoryFleetEntry;
      readonly branch: string;
      readonly cwd: string;
    }) => Effect.Effect<OpenMergeRequest | undefined, FleetServiceError>;
  }
>()("pi-custom-harness/lib/fleet/FleetGitLabService") {}

/** Package metadata and install seam used by versions/install. */
export class FleetPackageService extends Context.Service<
  FleetPackageService,
  {
    readonly versionFor: (input: {
      readonly repository: RepositoryFleetEntry;
      readonly packageName: string;
    }) => Effect.Effect<FleetVersion, FleetServiceError>;
    readonly installFor: (input: {
      readonly repository: RepositoryFleetEntry;
    }) => Effect.Effect<void, FleetServiceError>;
  }
>()("pi-custom-harness/lib/fleet/FleetPackageService") {}

/** Explicit Pi-boundary confirmation seam for destructive sync. */
export class FleetConfirmationService extends Context.Service<
  FleetConfirmationService,
  {
    readonly confirm: (input: {
      readonly pending: ReadonlyArray<FleetSyncPlan>;
    }) => Effect.Effect<boolean>;
  }
>()("pi-custom-harness/lib/fleet/FleetConfirmationService") {}

/** Portless orphan discovery and removal seam. */
export class FleetPortlessService extends Context.Service<
  FleetPortlessService,
  {
    readonly listOrphaned: () => Effect.Effect<
      ReadonlyArray<FleetPortlessServer>,
      FleetServiceError
    >;
    readonly remove: (input: {
      readonly server: FleetPortlessServer;
    }) => Effect.Effect<void, FleetServiceError>;
  }
>()("pi-custom-harness/lib/fleet/FleetPortlessService") {}
