import { expect, test } from "bun:test";
import { Effect, Option } from "effect";

import { GitService } from "../../lib/git/core";
import { GitLabService } from "../../lib/gitlab/core";
import { RepoMapService } from "../../lib/repo-map/core";
import { guardMergeRequestCreation } from "./core";

test("blocks MR creation when the current branch already has an MR", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.some({ iid: 42 })),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () =>
          Effect.die("MR creation guard checked commits for an existing MR"),
        hasChangesetOnCurrentBranch: () =>
          Effect.die("MR creation guard checked changesets for an existing MR"),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () =>
          Effect.die("MR creation guard resolved a release gate for an existing MR"),
      }),
    ),
  );

  expect(decision).toEqual({
    kind: "block",
    reason:
      "Branch already has MR !42. Update it instead of opening a second one.",
  });
});

test("blocks changeset MR creation when the current branch adds no changeset", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.none()),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () =>
          Effect.die("MR creation guard checked commits for a changeset repository"),
        hasChangesetOnCurrentBranch: () => Effect.succeed(false),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () => Effect.succeed("changeset"),
      }),
    ),
  );

  expect(decision).toEqual({
    kind: "block",
    reason:
      "No .changeset entry on this branch. Write one before opening the MR.",
  });
});

test("allows changeset MR creation when the current branch adds a changeset", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.none()),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () =>
          Effect.die("MR creation guard checked commits for a changeset repository"),
        hasChangesetOnCurrentBranch: () => Effect.succeed(true),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () => Effect.succeed("changeset"),
      }),
    ),
  );

  expect(decision).toEqual({ kind: "allow" });
});

test("allows semantic-release MR creation without a changeset when commits are conventional", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.none()),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () => Effect.succeed(true),
        hasChangesetOnCurrentBranch: () =>
          Effect.die("MR creation guard checked changesets for semantic-release"),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () => Effect.succeed("conventional-commits"),
      }),
    ),
  );

  expect(decision).toEqual({ kind: "allow" });
});

test("blocks semantic-release MR creation when a commit is not conventional", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.none()),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () => Effect.succeed(false),
        hasChangesetOnCurrentBranch: () =>
          Effect.die("MR creation guard checked changesets for semantic-release"),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () => Effect.succeed("conventional-commits"),
      }),
    ),
  );

  expect(decision).toEqual({
    kind: "block",
    reason:
      "semantic-release repo: every commit needs a conventional prefix, it sets the version.",
  });
});

test("allows MR creation for a repository with no release gate", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr create --fill",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.none()),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () =>
          Effect.die("MR creation guard checked commits for a repository with no release gate"),
        hasChangesetOnCurrentBranch: () =>
          Effect.die("MR creation guard checked changesets for a repository with no release gate"),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () => Effect.succeed("none"),
      }),
    ),
  );

  expect(decision).toEqual({ kind: "allow" });
});

test("allows commands that do not create an MR without contacting a guard service", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "glab mr view",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.die("MR creation guard queried GitLab for a non-create command"),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () =>
          Effect.die("MR creation guard checked commits for a non-create command"),
        hasChangesetOnCurrentBranch: () =>
          Effect.die("MR creation guard checked changesets for a non-create command"),
      }),
      Effect.provideService(RepoMapService, {
        releaseGateFor: () =>
          Effect.die("MR creation guard resolved a release gate for a non-create command"),
      }),
    ),
  );

  expect(decision).toEqual({ kind: "allow" });
});
