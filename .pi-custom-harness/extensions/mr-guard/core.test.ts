import { expect, test } from "bun:test";
import { Effect, Option } from "effect";

import { type GitReleaseReadiness, GitService } from "../../lib/git/core";
import { GitLabService } from "../../lib/gitlab/core";
import {
  RepoMapService,
  type RepositoryDeliveryPolicy,
  type RepositoryFacts,
} from "../../lib/repo-map/core";
import { guardMergeRequestCreation } from "./core";

const facts = (deliveryPolicy: RepositoryDeliveryPolicy): RepositoryFacts => ({
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
