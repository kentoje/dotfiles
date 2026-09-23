import { expect, test } from "bun:test";

import {
  mergeRequestTitleFromCommand,
  prepareMergeRequestCreation,
} from "./runtime";

const emptyPreflight = {
  worktrees: [],
  tickets: [],
  mergeRequests: [],
  action: "proceed" as const,
  reason: undefined,
};

test("extracts quoted merge request titles", () => {
  expect(
    mergeRequestTitleFromCommand(
      "mr-guard --title '[CI-6861] Add campaign filter' --fill",
    ),
  ).toBe("[CI-6861] Add campaign filter");
});

test("reports the conventional title expected before creation", async () => {
  const result = await prepareMergeRequestCreation(
    {
      command: "mr-guard --title '[CI-6861] Add campaign filter' --fill",
      cwd: "/workspace",
    },
    {
      readCommits: async () => [
        { subject: "feat: add campaign filter [CI-6861]", body: "" },
      ],
      preflight: async () => emptyPreflight,
    },
  );

  expect(result.expectedTitle).toBe("fix: Add campaign filter [CI-6861]");
  expect(result.titleValid).toBe(false);
});

test("returns duplicate preflight matches for an already open task MR", async () => {
  const mergeRequest = {
    iid: 1309,
    title: "feat: add campaign filter [CI-6861]",
    sourceBranch: "CI-6861",
  };
  const result = await prepareMergeRequestCreation(
    {
      command:
        "cd /worktrees/campaign-filter && mr-guard --title 'feat: add campaign filter [CI-6861]'",
      cwd: "/repository",
    },
    {
      readCommits: async (cwd) => {
        expect(cwd).toBe("/worktrees/campaign-filter");
        return [{ subject: "feat: add campaign filter [CI-6861]", body: "" }];
      },
      preflight: async ({ cwd, query }) => {
        expect(cwd).toBe("/worktrees/campaign-filter");
        expect(query).toBe("CI-6861");
        return {
          ...emptyPreflight,
          mergeRequests: [mergeRequest],
          action: "ask_user",
          reason: "Existing task resources match this merge-request request.",
        };
      },
    },
  );

  expect(result.titleValid).toBe(true);
  expect(result.preflight).toMatchObject({
    action: "ask_user",
    mergeRequests: [mergeRequest],
  });
});
