import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  ShipGateFactsService,
  shouldEvaluateShipGate,
} from "../../lib/ship-gate/core";
import { evaluate, evaluateWithFacts, recordShipGateAttempt } from "./core";
import {
  isVisualApprovalToolResult,
  makeShipGateFollowUp,
  verifyResult,
} from "./index";

const worktree = "/worktrees/task";
const passingFacts = {
  worktree,
  changedWorktrees: { [worktree]: "snapshot-4" },
  commitsAheadOfBase: true,
  mergeRequestExists: true,
  unresolvedThreadCount: 0,
  ticketBound: true,
  verificationPolicy: { kind: "repository-wide" },
  verificationEvidence: { focusedByWorktree: { [worktree]: "snapshot-4" } },
  editGeneration: 4,
  figmaBacked: false,
  visualReviewComplete: false,
  releaseReadiness: { kind: "none", ready: true, missingPackages: [] },
} as const;

const runtimeState = (editGeneration: number) => ({
  editGeneration,
  changedWorktrees: { [worktree]: `snapshot-${editGeneration}` },
  activeWorktree: worktree,
  verificationEvidence: { focusedByWorktree: {} },
  figmaBacked: false,
  visualReviewComplete: false,
});

test("defers shipping enforcement before the session edits source", () => {
  expect(shouldEvaluateShipGate(runtimeState(0))).toBe(false);
  expect(shouldEvaluateShipGate(runtimeState(1))).toBe(true);
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

test("blocks missing changesets for the affected package", () => {
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
  expect(result.blockers.map(({ category }) => category)).toContain(
    "release-artifact",
  );
});

test("checks unresolved threads and ticket binding", () => {
  expect(
    evaluate({
      attempt: 1,
      facts: { ...passingFacts, unresolvedThreadCount: 2 },
    }).blockers.map(({ category }) => category),
  ).toContain("unresolved-threads");
  expect(
    evaluate({
      attempt: 1,
      facts: { ...passingFacts, ticketBound: false },
    }).blockers.map(({ category }) => category),
  ).toContain("missing-ticket-binding");
});

test("accepts focused evidence for a repository-wide policy", () => {
  const result = evaluate({ attempt: 1, facts: passingFacts });
  expect(result.blockers.map(({ category }) => category)).not.toContain(
    "verify",
  );
});

test("extracts focused verification worktree from tool results", () => {
  const result = verifyResult({
    type: "tool_result",
    toolCallId: "verify-1",
    toolName: "verify",
    input: { action: "test", file: "/worktrees/task/a.test.ts" },
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: true, worktree: "/worktrees/task" }),
      },
    ],
    isError: false,
    details: undefined,
  });
  expect(result).toEqual({ ok: true, worktree: "/worktrees/task" });
});

test("recognizes explicit visual approval tool results", () => {
  expect(
    isVisualApprovalToolResult({
      type: "tool_result",
      toolCallId: "ask-1",
      toolName: "ask_user",
      input: {},
      content: [
        { type: "text", text: "Visual approval: Approve the rendered layout" },
      ],
      isError: false,
      details: undefined,
    }),
  ).toBe(true);
});
test("requires focused verification for every changed worktree", () => {
  const secondWorktree = "/worktrees/consumer";
  const result = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      changedWorktrees: {
        [worktree]: "snapshot-4",
        [secondWorktree]: "snapshot-5",
      },
      verificationEvidence: {
        focusedByWorktree: { [worktree]: "snapshot-4" },
      },
    },
  });
  expect(result.blockers).toContainEqual({
    category: "verify",
    reason: `focused verification has not passed for the latest snapshot in: ${secondWorktree}.`,
  });
});

test("holds Figma-backed work until explicit visual approval", () => {
  const blocked = evaluate({
    attempt: 1,
    facts: { ...passingFacts, figmaBacked: true },
  });
  expect(blocked.blockers.map(({ category }) => category)).toContain(
    "visual-review",
  );
  const approved = evaluate({
    attempt: 1,
    facts: {
      ...passingFacts,
      figmaBacked: true,
      visualReviewComplete: true,
    },
  });
  expect(approved.blockers.map(({ category }) => category)).not.toContain(
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
      verificationEvidence: { focusedByWorktree: {} },
      figmaBacked: true,
      releaseReadiness: {
        kind: "changesets",
        ready: false,
        missingPackages: ["@aircall/blocks"],
      },
    },
  });
  expect(result.kind).toBe("blocked");
  expect(result.blockers).toHaveLength(5);
  expect(result.records[0]?.blockers).toEqual(result.blockers);
});

test("caps retries and records repeated failures", () => {
  const first = evaluate({
    attempt: 1,
    facts: { ...passingFacts, ticketBound: false },
  });
  const second = evaluate({
    attempt: 2,
    facts: { ...passingFacts, ticketBound: false },
  });
  const third = evaluate({
    attempt: 3,
    facts: { ...passingFacts, ticketBound: false },
  });
  expect(third.retryExhausted).toBe(true);
  expect(
    recordShipGateAttempt(
      recordShipGateAttempt(undefined, first),
      second,
    ).records.map(({ attempt }) => attempt),
  ).toEqual([1, 2]);
});

test("facts are resolved through a fakeable Effect module", async () => {
  const result = await Effect.runPromise(
    evaluateWithFacts({
      cwd: worktree,
      attempt: 1,
      state: runtimeState(4),
    }).pipe(
      Effect.provideService(ShipGateFactsService, {
        factsFor: () => Effect.succeed(passingFacts),
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
