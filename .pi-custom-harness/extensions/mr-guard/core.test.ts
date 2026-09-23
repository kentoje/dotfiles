import { expect, test } from "bun:test";
import { Effect, Option } from "effect";

import { type GitReleaseReadiness, GitService } from "../../lib/git/core";
import { GitLabService } from "../../lib/gitlab/core";
import {
  RepoMapService,
  type RepositoryDeliveryPolicy,
  type RepositoryFacts,
} from "../../lib/repo-map/core";
import {
  effectiveWorkingDirectoryForCommand,
  guardMergeRequestCreation,
  isMergeRequestCreationCommand,
} from "./core";

const facts = (deliveryPolicy: RepositoryDeliveryPolicy): RepositoryFacts => ({
  repositoryRoot: "/worktree",
  deliveryPolicy,
  testRunner: "none",
  checks: [],
  devModes: [],
  setupScript: undefined,
  authMode: undefined,
  portlessAppName: "repo",
  worktreeRoot: "/tmp",
  portlessRoute: {
    protocol: "https",
    hostSuffix: ".localhost",
    appName: "repo",
    url: "https://repo.localhost",
  },
  repositories: [],
});

const evaluate = (
  deliveryPolicy: RepositoryDeliveryPolicy,
  readiness: GitReleaseReadiness,
) =>
  Effect.runPromise(
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
        changedFilesSinceDefaultBranch: () => Effect.succeed([]),
        committedChangesetsSinceDefaultBranch: () => Effect.succeed([]),
        releaseReadinessFor: () => Effect.succeed(readiness),
      }),
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.succeed(facts(deliveryPolicy)),
      }),
    ),
  );

test("blocks a publishable package change when its changeset is absent", async () => {
  const decision = await evaluate(
    {
      kind: "changesets",
      verification: { kind: "repository-wide" },
      changesetApplicability: { kind: "publishable-packages" },
    },
    {
      kind: "changesets",
      ready: false,
      missingPackages: ["@aircall/blocks"],
    },
  );
  expect(decision).toEqual({
    kind: "block",
    reason:
      "Missing required changeset(s) for package(s): @aircall/blocks. Write one before opening the MR.",
  });
});

test("allows a changeset repository when release readiness is satisfied", async () => {
  const decision = await evaluate(
    {
      kind: "changesets",
      verification: { kind: "repository-wide" },
      changesetApplicability: { kind: "publishable-packages" },
    },
    { kind: "changesets", ready: true, missingPackages: [] },
  );
  expect(decision).toEqual({ kind: "allow" });
});

test("blocks a conventional-commit release failure", async () => {
  const decision = await evaluate(
    { kind: "conventional-commits", verification: { kind: "repository-wide" } },
    { kind: "conventional-commits", ready: false, missingPackages: [] },
  );
  expect(decision).toEqual({
    kind: "block",
    reason:
      "semantic-release repo: every commit needs a conventional prefix, it sets the version.",
  });
});

test("allows an ordinary repository without release artifacts", async () => {
  const decision = await evaluate(
    { kind: "none", verification: { kind: "repository-wide" } },
    { kind: "none", ready: true, missingPackages: [] },
  );
  expect(decision).toEqual({ kind: "allow" });
});

test("blocks an existing merge request before resolving delivery policy", async () => {
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
          Effect.die("unexpected conventional check"),
        changedFilesSinceDefaultBranch: () =>
          Effect.die("unexpected changed files"),
        committedChangesetsSinceDefaultBranch: () =>
          Effect.die("unexpected changesets"),
        releaseReadinessFor: () => Effect.die("unexpected release readiness"),
      }),
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.die("unexpected facts"),
      }),
    ),
  );
  expect(decision).toEqual({
    kind: "block",
    reason:
      "Branch already has MR !42. Update it instead of opening a second one.",
  });
});

test("allows a confirmed duplicate through to release readiness", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "mr-guard --title 'fix: update filter [CI-6861]'",
      cwd: "/worktree",
      allowExistingMergeRequest: true,
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.some({ iid: 42 })),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () => Effect.succeed(true),
        changedFilesSinceDefaultBranch: () => Effect.succeed([]),
        committedChangesetsSinceDefaultBranch: () => Effect.succeed([]),
        releaseReadinessFor: () =>
          Effect.succeed({
            kind: "none",
            ready: true,
            missingPackages: [],
          }),
      }),
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () =>
          Effect.succeed(
            facts({ kind: "none", verification: { kind: "repository-wide" } }),
          ),
      }),
    ),
  );

  expect(decision).toEqual({ kind: "allow" });
});

test("recognizes the protected merge-request command", async () => {
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command: "mr-guard --fill --yes",
      cwd: "/worktree",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: () =>
          Effect.succeed(Option.some({ iid: 42 })),
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () => Effect.succeed(true),
        changedFilesSinceDefaultBranch: () => Effect.succeed([]),
        committedChangesetsSinceDefaultBranch: () => Effect.succeed([]),
        releaseReadinessFor: () => Effect.die("unexpected release readiness"),
      }),
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: () => Effect.die("unexpected facts"),
      }),
    ),
  );

  expect(decision).toEqual({
    kind: "block",
    reason:
      "Branch already has MR !42. Update it instead of opening a second one.",
  });
});

test("does not guard the command help diagnostic", () => {
  expect(isMergeRequestCreationCommand("mr-guard --help")).toBe(false);
  expect(isMergeRequestCreationCommand("mr-guard -h")).toBe(false);
});

test("extracts the directory a leading chained cd would enter", () => {
  expect(
    effectiveWorkingDirectoryForCommand(
      "cd /Users/kento/.pi/worktrees/hydra/DS-237 && glab mr create --fill --yes",
      "/Users/kento/conversation-center-ext",
    ),
  ).toBe("/Users/kento/.pi/worktrees/hydra/DS-237");
  expect(
    effectiveWorkingDirectoryForCommand(
      "cd '../hydra/DS-237' && glab mr create --fill",
      "/worktrees/conversation-center-ext",
    ),
  ).toBe("/worktrees/hydra/DS-237");
});

test("looks up merge request state in the chained cd target", async () => {
  const seen: string[] = [];
  const decision = await Effect.runPromise(
    guardMergeRequestCreation({
      command:
        "cd /Users/kento/.pi/worktrees/hydra/DS-237 && glab mr create --fill --yes",
      cwd: "/Users/kento/conversation-center-ext",
    }).pipe(
      Effect.provideService(GitLabService, {
        findOpenMergeRequestForCurrentBranch: ({ cwd }) => {
          seen.push(cwd);
          return Effect.succeed(Option.none());
        },
      }),
      Effect.provideService(GitService, {
        commitsAreConventional: () => Effect.succeed(true),
        changedFilesSinceDefaultBranch: () => Effect.succeed([]),
        committedChangesetsSinceDefaultBranch: () => Effect.succeed([]),
        releaseReadinessFor: ({ cwd }) => {
          seen.push(cwd);
          return Effect.succeed({
            kind: "none",
            ready: true,
            missingPackages: [],
          });
        },
      }),
      Effect.provideService(RepoMapService, {
        repositoryFactsFor: ({ cwd }) => {
          seen.push(cwd);
          return Effect.succeed(
            facts({ kind: "none", verification: { kind: "repository-wide" } }),
          );
        },
      }),
    ),
  );

  expect(seen).toEqual([
    "/Users/kento/.pi/worktrees/hydra/DS-237",
    "/Users/kento/.pi/worktrees/hydra/DS-237",
    "/Users/kento/.pi/worktrees/hydra/DS-237",
  ]);
  expect(decision).toEqual({ kind: "allow" });
});
