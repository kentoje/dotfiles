import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

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
  readonly allowExistingMergeRequest?: boolean;
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

/** Detects protected `mr-guard` and legacy `glab mr create` command forms. */
export const isMergeRequestCreationCommand = (command: string): boolean => {
  const invocation =
    /(?:^\s*|(?:&&|\|\||[;&|])\s*)(mr-guard(?:\s+([^;&|]*))?|glab\s+mr\s+create\b)/u.exec(
      command,
    );
  if (invocation === null) return false;
  const mrGuardArguments = invocation[2];
  return (
    mrGuardArguments === undefined ||
    !/(?:^|\s)(?:-h|--help)(?:\s|$)/u.test(mrGuardArguments)
  );
};

const expandHomeDirectory = (path: string): string =>
  path === "~"
    ? homedir()
    : path.startsWith("~/")
      ? `${homedir()}${path.slice(1)}`
      : path;

const resolveCommandDirectory = (cwd: string, target: string): string => {
  const expanded = expandHomeDirectory(target);
  return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
};

const leadingCdPattern =
  /^\s*cd\s+(?:(?:"([^"]+)")|(?:'([^']+)')|(\S+))\s*(?:&&|;)\s*/u;

/** Resolves the directory a leading chained `cd` would enter before the rest of the command. */
export const effectiveWorkingDirectoryForCommand = (
  command: string,
  cwd: string,
): string => {
  let remaining = command;
  let directory = cwd;
  while (true) {
    const match = leadingCdPattern.exec(remaining);
    if (match === null) {
      return directory;
    }
    const target = match[1] ?? match[2] ?? match[3];
    if (target === undefined || target.length === 0 || target === "-") {
      return directory;
    }
    directory = resolveCommandDirectory(directory, target);
    remaining = remaining.slice(match[0].length);
  }
};

/** Blocks a duplicate merge request before the Pi bash tool can execute it. */
export const guardMergeRequestCreation = Effect.fn("guardMergeRequestCreation")(
  function* ({
    command,
    cwd,
    allowExistingMergeRequest,
  }: MergeRequestCreationGuardInput) {
    if (!isMergeRequestCreationCommand(command)) {
      return { kind: "allow" } as const;
    }

    const targetDirectory = effectiveWorkingDirectoryForCommand(command, cwd);
    const gitLabService = yield* GitLabService;
    const gitService = yield* GitService;
    const repoMapService = yield* RepoMapService;
    const existingMergeRequest =
      yield* gitLabService.findOpenMergeRequestForCurrentBranch({
        cwd: targetDirectory,
      });

    if (Option.isSome(existingMergeRequest) && !allowExistingMergeRequest) {
      return {
        kind: "block",
        reason: `Branch already has MR !${existingMergeRequest.value.iid}. Update it instead of opening a second one.`,
      } as const;
    }

    const repositoryFacts = yield* repoMapService.repositoryFactsFor({
      cwd: targetDirectory,
    });
    const readiness = yield* gitService.releaseReadinessFor({
      cwd: targetDirectory,
      policy: repositoryFacts.deliveryPolicy,
    });
    const reason = releaseReadinessFailureReason(readiness, "opening the MR");
    if (reason !== undefined) {
      return { kind: "block", reason } as const;
    }
    return { kind: "allow" } as const;
  },
);
