import { Effect, Option } from "effect";

import { type GitChangesetLookupError, GitService } from "../../lib/git/core";
import {
  type GitLabMergeRequestLookupError,
  GitLabService,
} from "../../lib/gitlab/core";
import {
  type RepositoryReleaseGateLookupError,
  RepoMapService,
} from "../../lib/repo-map/core";

/** Input captured from a Pi bash tool call before it runs. */
export interface MergeRequestCreationGuardInput {
  readonly command: string;
  readonly cwd: string;
}

/** The handler outcome for an attempted merge request creation. */
export type MergeRequestCreationGuardDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "block"; readonly reason: string };

/** Errors that must block MR creation because guard state could not be verified. */
export type MergeRequestCreationGuardError =
  | GitChangesetLookupError
  | GitLabMergeRequestLookupError
  | RepositoryReleaseGateLookupError;

/** Detects the `glab mr create` command form that can create a duplicate merge request. */
export const isMergeRequestCreationCommand = (command: string): boolean =>
  /\bglab\s+mr\s+create\b/.test(command);

/** Blocks a duplicate merge request before the Pi bash tool can execute it. */
export const guardMergeRequestCreation = Effect.fn("guardMergeRequestCreation")(
  function* ({ command, cwd }: MergeRequestCreationGuardInput) {
    if (!isMergeRequestCreationCommand(command)) {
      return { kind: "allow" } as const;
    }

    const gitLabService = yield* GitLabService;
    const gitService = yield* GitService;
    const repoMapService = yield* RepoMapService;
    const existingMergeRequest =
      yield* gitLabService.findOpenMergeRequestForCurrentBranch({ cwd });

    if (Option.isSome(existingMergeRequest)) {
      return {
        kind: "block",
        reason: `Branch already has MR !${existingMergeRequest.value.iid}. Update it instead of opening a second one.`,
      } as const;
    }

    const releaseGate = yield* repoMapService.releaseGateFor({ cwd });
    switch (releaseGate) {
      case "changeset": {
        const hasChangeset =
          yield* gitService.hasChangesetOnCurrentBranch({ cwd });
        if (!hasChangeset) {
          return {
            kind: "block",
            reason:
              "No .changeset entry on this branch. Write one before opening the MR.",
          } as const;
        }

        return { kind: "allow" } as const;
      }
      case "conventional-commits": {
        const commitsAreConventional =
          yield* gitService.commitsAreConventional({ cwd });
        if (!commitsAreConventional) {
          return {
            kind: "block",
            reason:
              "semantic-release repo: every commit needs a conventional prefix, it sets the version.",
          } as const;
        }

        return { kind: "allow" } as const;
      }
      case "none":
        return { kind: "allow" } as const;
      default: {
        const _exhaustive: never = releaseGate;
        return _exhaustive;
      }
    }
  },
);
