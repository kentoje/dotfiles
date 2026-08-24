import { Context, type Effect, Schema } from "effect";
import type { RepositoryDeliveryPolicy } from "../repo-map/core";

/** A Git lookup failure that prevents delivery checks from being bypassed. */
export class GitChangesetLookupError extends Schema.TaggedError<GitChangesetLookupError>()(
  "GitChangesetLookupError",
  { message: Schema.String },
) {}

/** One committed changeset introduced on the current branch. */
export interface GitChangedChangeset {
  readonly path: string;
  readonly packages: ReadonlyArray<string>;
}

/** Release-artifact evidence resolved from the repository delivery policy. */
export type GitReleaseReadiness =
  | {
      readonly kind: "none";
      readonly ready: true;
      readonly missingPackages: ReadonlyArray<never>;
    }
  | {
      readonly kind: "changesets";
      readonly ready: boolean;
      readonly missingPackages: ReadonlyArray<string>;
    }
  | {
      readonly kind: "conventional-commits";
      readonly ready: boolean;
      readonly missingPackages: ReadonlyArray<never>;
    };

/** Formats one shared actionable reason for a missing release artifact. */
export const releaseReadinessFailureReason = (
  readiness: GitReleaseReadiness,
  deliveryAction: "delivery" | "opening the MR",
): string | undefined => {
  if (readiness.ready) return undefined;

  if (readiness.kind === "changesets") {
    const packages = readiness.missingPackages.join(", ");
    return packages.length > 0
      ? `Missing required changeset(s) for package(s): ${packages}. Write one before ${deliveryAction}.`
      : `Required changeset is missing. Write one before ${deliveryAction}.`;
  }

  return "semantic-release repo: every commit needs a conventional prefix, it sets the version.";
};

/** Provides deterministic Git and release facts without exposing Pi concerns. */
export class GitService extends Context.Service<
  GitService,
  {
    readonly commitsAreConventional: (input: {
      readonly cwd: string;
    }) => Effect.Effect<boolean, GitChangesetLookupError>;
    readonly changedFilesSinceDefaultBranch: (input: {
      readonly cwd: string;
    }) => Effect.Effect<ReadonlyArray<string>, GitChangesetLookupError>;
    readonly committedChangesetsSinceDefaultBranch: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      ReadonlyArray<GitChangedChangeset>,
      GitChangesetLookupError
    >;
    readonly releaseReadinessFor: (input: {
      readonly cwd: string;
      readonly policy: RepositoryDeliveryPolicy;
    }) => Effect.Effect<GitReleaseReadiness, GitChangesetLookupError>;
  }
>()("pi-custom-harness/lib/git/GitService") {}
