import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { GitChangesetLookupError, GitService } from "./core";

interface GitCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** Checks release artifacts against the remote default branch rather than the feature branch's tracking ref. */
export const GitLiveLayer = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const runGitCommand = Effect.fn("GitService.runGitCommand")(function* ({
      arguments_,
      cwd,
    }: {
      readonly arguments_: ReadonlyArray<string>;
      readonly cwd: string;
    }) {
      return yield* Effect.scoped(
        Effect.gen(function* () {
          const command = ChildProcess.make("git", arguments_, { cwd });
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.stdout.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;

          return { exitCode, output } satisfies GitCommandResult;
        }),
      );
    });

    const resolveDefaultBranchRef = Effect.fn(
      "GitService.resolveDefaultBranchRef",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const remoteHead = yield* runGitCommand({
        arguments_: ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
        cwd,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new GitChangesetLookupError({
              message: `Git default branch lookup failed: ${cause.message}`,
            }),
        ),
      );
      const remoteHeadRef = remoteHead.output
        .trim()
        .replace(/^refs\/remotes\//, "");

      if (remoteHead.exitCode === 0 && remoteHeadRef.startsWith("origin/")) {
        return remoteHeadRef;
      }

      for (const fallbackRef of ["origin/main", "origin/master"] as const) {
        const fallback = yield* runGitCommand({
          arguments_: ["rev-parse", "--verify", "--quiet", fallbackRef],
          cwd,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new GitChangesetLookupError({
                message: `Git default branch lookup failed: ${cause.message}`,
              }),
          ),
        );

        if (fallback.exitCode === 0) {
          return fallbackRef;
        }
      }

      return yield* new GitChangesetLookupError({
        message:
          "Git default branch lookup failed: origin/HEAD, origin/main, and origin/master are unavailable.",
      });
    });

    const hasChangesetOnCurrentBranch = Effect.fn(
      "GitService.hasChangesetOnCurrentBranch",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const defaultBranchRef = yield* resolveDefaultBranchRef({ cwd });
      const result = yield* runGitCommand({
        arguments_: [
          "diff",
          "--name-only",
          `${defaultBranchRef}...HEAD`,
          "--",
          ".changeset",
        ],
        cwd,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new GitChangesetLookupError({
              message: `Git changeset lookup failed: ${cause.message}`,
            }),
        ),
      );

      if (result.exitCode !== 0) {
        return yield* new GitChangesetLookupError({
          message: `Git changeset lookup failed: git diff exited with ${result.exitCode}`,
        });
      }

      return result.output.trim().length > 0;
    });

    const commitsAreConventional = Effect.fn(
      "GitService.commitsAreConventional",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const defaultBranchRef = yield* resolveDefaultBranchRef({ cwd });
      const result = yield* runGitCommand({
        arguments_: ["log", "--format=%s", `${defaultBranchRef}..HEAD`],
        cwd,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new GitChangesetLookupError({
              message: `Git conventional commit lookup failed: ${cause.message}`,
            }),
        ),
      );

      if (result.exitCode !== 0) {
        return yield* new GitChangesetLookupError({
          message: `Git conventional commit lookup failed: git log exited with ${result.exitCode}`,
        });
      }

      return result.output
        .split("\n")
        .filter((subject) => subject.length > 0)
        .every((subject) =>
          /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)\r\n]+\))?!?: .+/.test(
            subject,
          ),
        );
    });

    return GitService.of({
      commitsAreConventional,
      hasChangesetOnCurrentBranch,
    });
  }),
).pipe(Layer.provide(BunServicesLayer));
