import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  ShipGateFactsService,
  shouldEvaluateShipGate,
} from "../../lib/ship-gate/core";
import { evaluate, evaluateWithFacts, recordShipGateAttempt } from "./core";
import { makeShipGateFollowUp } from "./index";

const passingFacts = {
  commitsAheadOfBase: true,
  mergeRequestExists: true,
  unresolvedThreadCount: 0,
  ticketBound: true,
  verificationPolicy: { kind: "repository-wide" },
  verificationEvidence: {
    repositoryWideEditGeneration: 4,
    focusedTestEditGeneration: undefined,
  },
  editGeneration: 4,
  pipelineSettled: true,
  figmaBacked: false,
  visualReviewComplete: false,
  releaseReadiness: { kind: "none", ready: true, missingPackages: [] },
} as const;

test("defers shipping enforcement before the session edits source", () => {
  expect(
    shouldEvaluateShipGate({
      editGeneration: 0,
      verificationEvidence: {
        repositoryWideEditGeneration: undefined,
        focusedTestEditGeneration: undefined,
      },
      figmaBacked: false,
      visualReviewComplete: false,
    }),
  ).toBe(false);
  expect(
    shouldEvaluateShipGate({
      editGeneration: 1,
      verificationEvidence: {
        repositoryWideEditGeneration: undefined,
        focusedTestEditGeneration: undefined,
      },
      figmaBacked: false,
      visualReviewComplete: false,
    }),
  ).toBe(true);
});

test("clean completion has no blockers", () => {
  expect(evaluate({ attempt: 1, facts: passingFacts })).toEqual({
    kind: "complete",
    attempts: 1,
    blockers: [],
    records: [{ attempt: 1, blockers: [] }],
    retryExhausted: false,
  });
});

test("checks missing MR only when commits are ahead", () => {
  const result = evaluate({
    attempt: 1,
    facts: { ...passingFacts, mergeRequestExists: false },
  });
  expect(result.blockers.map(({ category }) => category)).toContain(
    "missing-mr",
  );
});
test("blocks missing changesets for the affected package even when an MR exists", () => {
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      releaseReadiness: {
        kind: "changesets",
        ready: false,
        missingPackages: ["@aircall/blocks"],
      },
    },
  });
  expect(result.blockers).toContainEqual({
    category: "release-artifact",
    reason:
      "Missing required changeset(s) for package(s): @aircall/blocks. Write one before delivery.",
  });
});

test("blocks a conventional-commit release failure", () => {
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      releaseReadiness: {
        kind: "conventional-commits",
        ready: false,
        missingPackages: [],
      },
    },
  });
  expect(result.blockers).toContainEqual({
    category: "release-artifact",
    reason:
      "semantic-release repo: every commit needs a conventional prefix, it sets the version.",
  });
});

test("checks unresolved threads", () => {
  const result = evaluate({
    attempt: 1,
    facts: { ...passingFacts, unresolvedThreadCount: 2 },
  });
  expect(result.blockers.map(({ category }) => category)).toContain(
    "unresolved-threads",
  );
});

test("checks ticket binding", () => {
  const result = evaluate({
    attempt: 1,
    facts: { ...passingFacts, ticketBound: false },
  });
  expect(result.blockers.map(({ category }) => category)).toContain(
    "missing-ticket-binding",
  );
});

test("repository-wide verification from an older edit is stale", () => {
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      editGeneration: 5,
    },
  });
  expect(result.blockers.map(({ category }) => category)).toContain("verify");
});

test("accepts a fresh focused test for a focused-only repository", () => {
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      verificationPolicy: { kind: "focused-only", workspaceRoot: "/hydra" },
      verificationEvidence: {
        repositoryWideEditGeneration: undefined,
        focusedTestEditGeneration: 4,
      },
    },
  });
  expect(result.blockers.map(({ category }) => category)).not.toContain(
    "verify",
  );
});

test("rejects repository-wide evidence for a focused-only repository", () => {
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      verificationPolicy: { kind: "focused-only", workspaceRoot: "/hydra" },
    },
  });
  expect(result.blockers).toContainEqual({
    category: "verify",
    reason: "focused test verification has not passed after the latest edit.",
  });
});

test("checks unsettled pipeline", () => {
  const result = evaluate({
    attempt: 1,
    facts: { ...passingFacts, pipelineSettled: false },
  });
  expect(result.blockers.map(({ category }) => category)).toContain("pipeline");
});

test("holds Figma-backed work for visual review", () => {
  const result = evaluate({
    attempt: 1,
    facts: { ...passingFacts, figmaBacked: true },
  });
  expect(result.blockers.map(({ category }) => category)).toContain(
    "visual-review",
  );
});

test("reports combined blockers and records them", () => {
  const result = evaluate({
    attempt: 2,
    facts: {
      ...passingFacts,
      mergeRequestExists: false,
      ticketBound: false,
      verificationEvidence: {
        repositoryWideEditGeneration: undefined,
        focusedTestEditGeneration: undefined,
      },
      pipelineSettled: false,
      figmaBacked: true,
      releaseReadiness: {
        kind: "changesets",
        ready: false,
        missingPackages: ["@aircall/blocks"],
      },
    },
  });
  expect(result.kind).toBe("blocked");
  expect(result.blockers).toHaveLength(6);
  expect(result.blockers.map(({ category }) => category)).toContain(
    "release-artifact",
  );
  expect(result.records[0]?.blockers).toEqual(result.blockers);
});

test("caps retries at three without another attempt", () => {
  const result = evaluate({
    attempt: 3,
    facts: { ...passingFacts, ticketBound: false },
  });
  expect(result.retryExhausted).toBe(true);
  expect(result.attempts).toBe(3);
});

test("repeated failure records each attempt", () => {
  const first = evaluate({
    attempt: 1,
    facts: { ...passingFacts, ticketBound: false },
  });
  const second = evaluate({
    attempt: 2,
    facts: { ...passingFacts, ticketBound: false },
  });
  const third = recordShipGateAttempt(
    recordShipGateAttempt(undefined, first),
    second,
  );
  expect(third.records.map(({ attempt }) => attempt)).toEqual([1, 2]);
});

test("facts are resolved through a fakeable Effect service", async () => {
  const result = await Effect.runPromise(
    evaluateWithFacts({
      cwd: "/worktree",
      attempt: 1,
      state: {
        editGeneration: 4,
        verificationEvidence: {
          repositoryWideEditGeneration: 4,
          focusedTestEditGeneration: undefined,
        },
        figmaBacked: false,
        visualReviewComplete: false,
      },
    }).pipe(
      Effect.provideService(ShipGateFactsService, {
        factsFor: ({ state }) => Effect.succeed({ ...passingFacts, ...state }),
      }),
    ),
  );
  expect(result.kind).toBe("complete");
});

test("follow-up contract uses one triggered follow-up delivery", () => {
  const outcome = evaluate({
    attempt: 1,
    facts: { ...passingFacts, ticketBound: false },
  });
  expect(makeShipGateFollowUp(outcome).options).toEqual({
    deliverAs: "followUp",
    triggerTurn: true,
  });
});
