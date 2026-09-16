import { homedir } from "node:os";
import { join } from "node:path";

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
      readonly kind: "focused-then-all";
      readonly workspaceRoot: string;
    }
  | {
      readonly kind: "repository-wide";
    };

/** Verification kinds that may be selected by an explicit repository override. */
export type RepositoryVerificationPolicyKind =
  RepositoryVerificationPolicy["kind"];

/** True when the policy may run a focused `verify test --file`. */
export const verificationPolicyAllowsFocusedTest = (
  policy: RepositoryVerificationPolicy,
): boolean =>
  policy.kind === "focused-only" || policy.kind === "focused-then-all";

/** True when the policy may run the complete repository check list. */
export const verificationPolicyAllowsRepositoryWide = (
  policy: RepositoryVerificationPolicy,
): boolean =>
  policy.kind === "repository-wide" || policy.kind === "focused-then-all";

/** Workspace root used to discover a focused test package, when the policy has one. */
export const verificationPolicyWorkspaceRoot = (
  policy: RepositoryVerificationPolicy,
): string | undefined =>
  policy.kind === "repository-wide" ? undefined : policy.workspaceRoot;

/** Builds the typed verification policy for a selected kind and repository root. */
export const verificationPolicyFor = (
  kind: RepositoryVerificationPolicyKind,
  repositoryRoot: string,
): RepositoryVerificationPolicy => {
  switch (kind) {
    case "focused-only":
      return { kind: "focused-only", workspaceRoot: repositoryRoot };
    case "focused-then-all":
      return { kind: "focused-then-all", workspaceRoot: repositoryRoot };
    case "repository-wide":
      return { kind: "repository-wide" };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
};

/** Explicit repository-specific delivery settings that supersede detectable defaults. */
export interface RepositoryDeliveryPolicyOverride {
  readonly release: "changesets" | "conventional-commits" | "none";
  readonly verification?: RepositoryVerificationPolicyKind;
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
  readonly worktreeRoot?: string;
  readonly portlessRoute: RepositoryPortlessRouteConfiguration;
  readonly authModeOverrides: Readonly<Record<string, RepositoryAuthMode>>;
  readonly portlessAppNameOverrides: Readonly<Record<string, string>>;
  readonly deliveryPolicyOverrides: Readonly<
    Record<string, RepositoryDeliveryPolicyOverride>
  >;
  readonly repositories: ReadonlyArray<RepositoryFleetEntry>;
}

/** Shell variable that relocates Pi worktrees off the default home path. */
export const WorktreeRootEnvironmentVariable = "PI_WORKTREE_ROOT";

/** Fallback worktree root when PI_WORKTREE_ROOT is unset. */
export const FallbackWorktreeRoot = "~/.pi/worktrees";

/** Resolves the worktree root: explicit config, then PI_WORKTREE_ROOT, then ~/.pi/worktrees. */
export const resolveWorktreeRoot = ({
  configuredRoot,
  environmentValue,
}: {
  readonly configuredRoot: string | undefined;
  readonly environmentValue: string | undefined;
}): string => {
  if (configuredRoot !== undefined && configuredRoot.trim().length > 0) {
    return configuredRoot;
  }
  const trimmedEnvironment = environmentValue?.trim();
  if (trimmedEnvironment !== undefined && trimmedEnvironment.length > 0) {
    return trimmedEnvironment;
  }
  return FallbackWorktreeRoot;
};

const GitLabRepositoryRoot = join(homedir(), "Documents/gitlab");

/** Repositories included in fleet-wide status and maintenance operations. */
export const DefaultFleetRepositories = [
  { name: "hydra", path: join(GitLabRepositoryRoot, "hydra") },
  { name: "dashboard-v4", path: join(GitLabRepositoryRoot, "dashboard-v4") },
  {
    name: "conversation-center-ext",
    path: join(
      GitLabRepositoryRoot,
      "dashboard-extensions/conversation-center-ext",
    ),
  },
  {
    name: "analytics-extension",
    path: join(
      GitLabRepositoryRoot,
      "dashboard-extensions/analytics-extension",
    ),
  },
  { name: "assets-page", path: join(GitLabRepositoryRoot, "assets-page") },
] as const satisfies ReadonlyArray<RepositoryFleetEntry>;

/** The selected worktree, portless, auth, and fleet configuration for this harness. */
export const DefaultRepositoryFactsConfiguration = {
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
  },
  authModeOverrides: {},
  portlessAppNameOverrides: {},
  deliveryPolicyOverrides: {
    "conversation-center-ext": {
      release: "conventional-commits",
      verification: "focused-then-all",
    },
    "conversations-center-ext": {
      release: "conventional-commits",
      verification: "focused-then-all",
    },
  },
  repositories: DefaultFleetRepositories,
} satisfies RepositoryFactsConfiguration;

/** Common facts owned by the repository map and consumed by harness modules. */
export interface RepositoryFactsBase {
  readonly repositoryRoot: string;
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
