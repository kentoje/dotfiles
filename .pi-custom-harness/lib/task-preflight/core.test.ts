import { expect, test } from "bun:test";

import { taskPreflightDecision } from "./core";

const matches = {
  worktrees: [
    { path: "/worktrees/campaign-filter", branch: "feat/filter/CI-6861" },
  ],
  tickets: [{ key: "CI-6861", summary: "Add campaign filter" }],
  mergeRequests: [
    {
      iid: 1309,
      title: "feat: add campaign filter [CI-6861]",
      sourceBranch: "CI-6861",
    },
  ],
};

test("reports every matching task resource", () => {
  const preflight = taskPreflightDecision({ matches, resource: "worktree" });

  expect(preflight.worktrees).toEqual(matches.worktrees);
  expect(preflight.tickets).toEqual(matches.tickets);
  expect(preflight.mergeRequests).toEqual(matches.mergeRequests);
});

test("requires an explicit decision before duplicate creation", () => {
  const preflight = taskPreflightDecision({ matches, resource: "worktree" });

  expect(preflight.action).toBe("ask_user");
  expect(preflight.reason).toContain("Existing");
});

test("allows a worktree when only its source ticket exists", () => {
  const preflight = taskPreflightDecision({
    matches: { worktrees: [], tickets: matches.tickets, mergeRequests: [] },
    resource: "worktree",
  });

  expect(preflight.action).toBe("proceed");
});
