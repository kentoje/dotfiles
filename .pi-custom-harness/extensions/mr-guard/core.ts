import { Effect, Option } from "effect";

import {
  type GitChangesetLookupError,
  GitService,
  releaseReadinessFailureReason,
} from "../../lib/git/core";
import {
  type GitLabMergeRequestLookupError,
  GitLabService,
} from "../../lib/gitlab/core";
import {
  RepoMapService,
  type RepositoryFactsLookupError,
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
  | RepositoryFactsLookupError;

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

    const repositoryFacts = yield* repoMapService.repositoryFactsFor({ cwd });
    const readiness = yield* gitService.releaseReadinessFor({
      cwd,
      policy: repositoryFacts.deliveryPolicy,
    });
    const reason = releaseReadinessFailureReason(readiness, "opening the MR");
    if (reason !== undefined) {
      return { kind: "block", reason } as const;
    }
    return { kind: "allow" } as const;
  },
);
