import { Context, type Effect, Schema } from "effect";

/** Repository-wide delivery rules selected by the repository map. */
export type RepositoryDeliveryPolicy =
  | {
      readonly kind: "changesets";
      readonly verification: RepositoryVerificationPolicy;
      readonly changesetApplicability: {
        readonly kind: "publishable-packages";
      };
    }
  | {
      readonly kind: "conventional-commits";
      readonly verification: RepositoryVerificationPolicy;
    }
  | {
      readonly kind: "none";
      readonly verification: RepositoryVerificationPolicy;
    };

/** The test command implementation detected from repository dependencies or scripts. */
export type RepositoryTestRunner = "vitest" | "jest" | "none";

/** A check script, in the order the verify module must run it. */
export type RepositoryCheck =
  | "ts:check"
  | "biome:check"
  | "test"
  | "graphql:check"
  | "fallow";

/** A development mode exposed by a repository package script. */
export type RepositoryDevMode = "dev" | "dev:integrate" | "dev:mock";

/** An auth strategy declared for a repository when package metadata cannot infer it. */
export type RepositoryAuthMode = "none" | "dev-plugin" | "browser-login";

/** The typed verification policy, including focused package discovery metadata. */
export type RepositoryVerificationPolicy =
  | {
      readonly kind: "focused-only";
      readonly workspaceRoot: string;
    }
  | {
      readonly kind: "repository-wide";
    };

/** Explicit repository-specific delivery settings that supersede detectable defaults. */
export interface RepositoryDeliveryPolicyOverride {
  readonly release: "changesets" | "conventional-commits" | "none";
  readonly verification?: "focused-only" | "repository-wide";
}

/** The selected portless URL shape used for all repository worktrees. */
export interface RepositoryPortlessRouteConfiguration {
  readonly protocol: "http" | "https";
  readonly hostSuffix: string;
}

/** A repository path and display name used by fleet operations. */
export interface RepositoryFleetEntry {
  readonly name: string;
  readonly path: string;
}

/** Non-detectable repository facts declared in this module's one configuration source. */
export interface RepositoryFactsConfiguration {
  readonly worktreeRoot: string;
  readonly portlessRoute: RepositoryPortlessRouteConfiguration;
  readonly authModeOverrides: Readonly<Record<string, RepositoryAuthMode>>;
  readonly portlessAppNameOverrides: Readonly<Record<string, string>>;
  readonly deliveryPolicyOverrides: Readonly<
    Record<string, RepositoryDeliveryPolicyOverride>
  >;
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}

/** The selected worktree, portless, auth, and fleet configuration for this harness. */
export const DefaultRepositoryFactsConfiguration = {
  worktreeRoot: "~/.pi/worktrees",
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
  },
  authModeOverrides: {},
  portlessAppNameOverrides: {},
  deliveryPolicyOverrides: {},
  repositories: [],
} satisfies RepositoryFactsConfiguration;

/** Common facts owned by the repository map and consumed by harness modules. */
export interface RepositoryFactsBase {
  readonly testRunner: RepositoryTestRunner;
  readonly checks: ReadonlyArray<RepositoryCheck>;
  readonly devModes: ReadonlyArray<RepositoryDevMode>;
  readonly setupScript: string | undefined;
  readonly authMode: RepositoryAuthMode | undefined;
  readonly portlessAppName: string;
  readonly worktreeRoot: string;
  readonly portlessRoute: {
    readonly protocol: "http" | "https";
    readonly hostSuffix: string;
    readonly appName: string;
    readonly url: string;
  };
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}

/** Facts owned by the repository map, including one canonical delivery policy. */
export interface RepositoryFacts extends RepositoryFactsBase {
  readonly deliveryPolicy: RepositoryDeliveryPolicy;
}

/** A repository lookup failure that must prevent an unknown delivery policy from being bypassed. */
export class RepositoryFactsLookupError extends Schema.TaggedError<RepositoryFactsLookupError>()(
  "RepositoryFactsLookupError",
  { message: Schema.String },
) {}

/** Input for resolving all repository facts from a working directory. */
export interface RepositoryFactsInput {
  readonly cwd: string;
  readonly configuration?: RepositoryFactsConfiguration;
}

/** Resolves repository facts owned by the harness repository map. */
export class RepoMapService extends Context.Service<
  RepoMapService,
  {
    /** Resolves all detectable and explicitly configured facts for a repository. */
    readonly repositoryFactsFor: (
      input: RepositoryFactsInput,
    ) => Effect.Effect<RepositoryFacts, RepositoryFactsLookupError>;
  }
>()("pi-custom-harness/lib/repo-map/RepoMapService") {}
