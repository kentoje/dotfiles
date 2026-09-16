import { Context, Effect, Schema } from "effect";

import {
  type GitReleaseReadiness,
  releaseReadinessFailureReason,
} from "../git/core";
import type { RepositoryVerificationPolicy } from "../repo-map/core";

/** A category of work that prevents a branch from being shipped. */
export type ShipGateBlockerCategory =
  | "missing-mr"
  | "unresolved-threads"
  | "missing-ticket-binding"
  | "verify"
  | "visual-review"
  | "release-artifact";

/** One observed blocker, retained for false-positive measurement. */
export interface ShipGateBlocker {
  readonly category: ShipGateBlockerCategory;
  readonly reason: string;
}

/** A single gate evaluation record, including every blocker observed in that attempt. */
export interface ShipGateAttemptRecord {
  readonly attempt: number;
  readonly blockers: ReadonlyArray<ShipGateBlocker>;
}

/** Stable event payload consumed by notification handlers without policy internals. */
export interface ShipGateOutcome {
  readonly kind: "complete" | "blocked";
  readonly attempts: number;
  readonly blockers: ReadonlyArray<ShipGateBlocker>;
  readonly records: ReadonlyArray<ShipGateAttemptRecord>;
  readonly retryExhausted: boolean;
}

/** Fresh verification generations captured from successful verify tool results. */
export interface ShipGateVerificationEvidence {
  readonly repositoryWideEditGeneration: number | undefined;
  readonly focusedTestEditGeneration: number | undefined;
}

/** Facts needed by the gate, supplied by fakeable services and Pi session state. */
export interface ShipGateFacts {
  readonly commitsAheadOfBase: boolean;
  readonly mergeRequestExists: boolean;
  readonly unresolvedThreadCount: number;
  readonly ticketBound: boolean;
  readonly verificationPolicy: RepositoryVerificationPolicy;
  readonly verificationEvidence: ShipGateVerificationEvidence;
  readonly editGeneration: number;
  readonly figmaBacked: boolean;
  readonly visualReviewComplete: boolean;
  readonly releaseReadiness: GitReleaseReadiness;
}

/** Runtime state that belongs to the Pi index, not the policy core. */
export interface ShipGateRuntimeState {
  editGeneration: number;
  verificationEvidence: ShipGateVerificationEvidence;
  figmaBacked: boolean;
  visualReviewComplete: boolean;
}

const isShippingBranch = (facts: ShipGateFacts): boolean =>
  facts.commitsAheadOfBase || facts.mergeRequestExists;

const verifyBlocker = (reason: string): ShipGateBlocker => ({
  category: "verify",
  reason,
});

/** Selects the verification blocker required by the repository policy. */
export const verificationBlockerFor = (
  facts: ShipGateFacts,
): ShipGateBlocker | undefined => {
  switch (facts.verificationPolicy.kind) {
    case "focused-only":
      return facts.verificationEvidence.focusedTestEditGeneration ===
        facts.editGeneration
        ? undefined
        : verifyBlocker(
            "focused test verification has not passed after the latest edit.",
          );
    case "repository-wide":
      return facts.verificationEvidence.repositoryWideEditGeneration ===
        facts.editGeneration
        ? undefined
        : verifyBlocker(
            "repository-wide verification has not passed after the latest edit.",
          );
    case "focused-then-all": {
      if (
        isShippingBranch(facts) &&
        facts.verificationEvidence.repositoryWideEditGeneration === undefined
      ) {
        return verifyBlocker(
          "repository-wide verification has not passed before shipping.",
        );
      }
      const focusedAtCurrentEdit =
        facts.verificationEvidence.focusedTestEditGeneration ===
        facts.editGeneration;
      const repositoryWideAtCurrentEdit =
        facts.verificationEvidence.repositoryWideEditGeneration ===
        facts.editGeneration;
      return focusedAtCurrentEdit || repositoryWideAtCurrentEdit
        ? undefined
        : verifyBlocker(
            "focused test verification has not passed after the latest edit.",
          );
    }
    default: {
      const _exhaustive: never = facts.verificationPolicy;
      return _exhaustive;
    }
  }
};

/** Defers shipping enforcement until the current session has made a source edit. */
export const shouldEvaluateShipGate = (state: ShipGateRuntimeState): boolean =>
  state.editGeneration > 0;

/** Input accepted by the fakeable facts service. */
export interface ShipGateFactsInput {
  readonly cwd: string;
  readonly state: ShipGateRuntimeState;
}
/** Git facts needed to detect work that has not been opened as an MR. */
export class ShipGateGitService extends Context.Service<
  ShipGateGitService,
  {
    readonly commitsAheadOfBase: (input: {
      readonly cwd: string;
    }) => Effect.Effect<boolean, ShipGateFactsError>;
  }
>()("pi-custom-harness/lib/ship-gate/ShipGateGitService") {}

/** Failure while resolving ship-gate facts. */
export class ShipGateFactsError extends Schema.TaggedError<ShipGateFactsError>()(
  "ShipGateFactsError",
  { message: Schema.String },
) {}

/** Read-only facts service; repository and provider details remain outside policy. */
export class ShipGateFactsService extends Context.Service<
  ShipGateFactsService,
  {
    readonly factsFor: (
      input: ShipGateFactsInput,
    ) => Effect.Effect<ShipGateFacts, ShipGateFactsError>;
  }
>()("pi-custom-harness/lib/ship-gate/ShipGateFactsService") {}

/** Evaluates all independent ship blockers in one attempt. */
export const evaluateShipGate = (input: {
  readonly attempt: number;
  readonly facts: ShipGateFacts;
}): ShipGateOutcome => {
  const { facts } = input;
  const blockers: ShipGateBlocker[] = [];
  const releaseReason = releaseReadinessFailureReason(
    facts.releaseReadiness,
    "delivery",
  );
  if (releaseReason !== undefined) {
    blockers.push({ category: "release-artifact", reason: releaseReason });
  }
  if (facts.commitsAheadOfBase && !facts.mergeRequestExists) {
    blockers.push({
      category: "missing-mr",
      reason:
        "Branch has commits ahead of its base branch but no merge request.",
    });
  }
  if (facts.mergeRequestExists && facts.unresolvedThreadCount > 0) {
    blockers.push({
      category: "unresolved-threads",
      reason: `${facts.unresolvedThreadCount} merge request discussion thread(s) remain unresolved.`,
    });
  }
  if (!facts.ticketBound)
    blockers.push({
      category: "missing-ticket-binding",
      reason: "The current worktree has no bound ticket.",
    });
  const verificationBlocker = verificationBlockerFor(facts);
  if (verificationBlocker !== undefined) {
    blockers.push(verificationBlocker);
  }
  if (facts.figmaBacked && !facts.visualReviewComplete) {
    blockers.push({
      category: "visual-review",
      reason: "Figma-backed work requires human visual review before shipping.",
    });
  }
  const record: ShipGateAttemptRecord = { attempt: input.attempt, blockers };
  return blockers.length === 0
    ? {
        kind: "complete",
        attempts: input.attempt,
        blockers: [],
        records: [record],
        retryExhausted: false,
      }
    : {
        kind: "blocked",
        attempts: input.attempt,
        blockers,
        records: [record],
        retryExhausted: input.attempt >= 3,
      };
};

/** Appends one evaluation to the stable outcome retained by the Pi index. */
export const recordShipGateAttempt = (
  previous: ShipGateOutcome | undefined,
  current: ShipGateOutcome,
): ShipGateOutcome => ({
  kind: current.kind,
  attempts: current.attempts,
  blockers: current.blockers,
  records: [...(previous?.records ?? []), ...current.records],
  retryExhausted: current.retryExhausted,
});

/** Resolves facts and evaluates one attempt through the Effect service seam. */
export const runShipGate = (input: {
  readonly cwd: string;
  readonly attempt: number;
  readonly state: ShipGateRuntimeState;
}): Effect.Effect<ShipGateOutcome, ShipGateFactsError, ShipGateFactsService> =>
  Effect.gen(function* () {
    const service = yield* ShipGateFactsService;
    return evaluateShipGate({
      attempt: input.attempt,
      facts: yield* service.factsFor({ cwd: input.cwd, state: input.state }),
    });
  });
