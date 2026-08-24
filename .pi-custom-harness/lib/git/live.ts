import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import type { RepositoryDeliveryPolicy } from "../repo-map/core";
import {
  type GitChangedChangeset,
  GitChangesetLookupError,
  type GitReleaseReadiness,
  GitService,
} from "./core";

interface GitCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

const PackageManifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  private: Schema.optional(Schema.Boolean),
});
const decodePackageManifest = Schema.decodeUnknownEffect(PackageManifest);

/** Checks release artifacts against the remote default branch rather than the feature branch's tracking ref. */
export const GitLiveLayer = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

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

    const mapGitError =
      (prefix: string) =>
      (cause: unknown): GitChangesetLookupError =>
        new GitChangesetLookupError({
          message: `${prefix}: ${cause instanceof Error ? cause.message : String(cause)}`,
        });

    const resolveDefaultBranchRef = Effect.fn(
      "GitService.resolveDefaultBranchRef",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const remoteHead = yield* runGitCommand({
        arguments_: ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
        cwd,
      }).pipe(Effect.mapError(mapGitError("Git default branch lookup failed")));
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
          Effect.mapError(mapGitError("Git default branch lookup failed")),
        );
        if (fallback.exitCode === 0) return fallbackRef;
      }
      return yield* new GitChangesetLookupError({
        message:
          "Git default branch lookup failed: origin/HEAD, origin/main, and origin/master are unavailable.",
      });
    });

    const changedFilesSinceDefaultBranch = Effect.fn(
      "GitService.changedFilesSinceDefaultBranch",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const defaultBranchRef = yield* resolveDefaultBranchRef({ cwd });
      const result = yield* runGitCommand({
        arguments_: [
          "diff",
          "--name-only",
          `${defaultBranchRef}...HEAD`,
          "--",
          ".",
        ],
        cwd,
      }).pipe(Effect.mapError(mapGitError("Git changed-file lookup failed")));
      if (result.exitCode !== 0) {
        return yield* new GitChangesetLookupError({
          message: `Git changed-file lookup failed: git diff exited with ${result.exitCode}`,
        });
      }
      return result.output
        .split("\n")
        .map((file) => file.trim())
        .filter((file) => file.length > 0);
    });

    const committedChangesetsSinceDefaultBranch = Effect.fn(
      "GitService.committedChangesetsSinceDefaultBranch",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const defaultBranchRef = yield* resolveDefaultBranchRef({ cwd });
      const result = yield* runGitCommand({
        arguments_: [
          "diff",
          "--diff-filter=AM",
          "--name-only",
          `${defaultBranchRef}...HEAD`,
          "--",
          ".changeset",
        ],
        cwd,
      }).pipe(Effect.mapError(mapGitError("Git changeset lookup failed")));
      if (result.exitCode !== 0) {
        return yield* new GitChangesetLookupError({
          message: `Git changeset lookup failed: git diff exited with ${result.exitCode}`,
        });
      }
      const paths = result.output
        .split("\n")
        .map((file) => file.trim())
        .filter(
          (file) => file.startsWith(".changeset/") && file.endsWith(".md"),
        );
      const values: GitChangedChangeset[] = [];
      for (const file of paths) {
        const content = yield* runGitCommand({
          arguments_: ["show", `HEAD:${file}`],
          cwd,
        }).pipe(
          Effect.mapError(mapGitError(`Git changeset read failed for ${file}`)),
        );
        if (content.exitCode !== 0) {
          return yield* new GitChangesetLookupError({
            message: `Git changeset read failed for ${file}: git show exited with ${content.exitCode}`,
          });
        }
        const packages: string[] = [];
        for (const match of content.output.matchAll(
          /^\s*["']?([^"'\s:]+)["']?\s*:/gm,
        )) {
          const packageName = match[1];
          if (packageName?.startsWith("@")) packages.push(packageName);
        }
        values.push({ path: file, packages });
      }
      return values;
    });

    const releaseReadinessFor = Effect.fn("GitService.releaseReadinessFor")(
      function* ({
        cwd,
        policy,
      }: {
        readonly cwd: string;
        readonly policy: RepositoryDeliveryPolicy;
      }) {
        switch (policy.kind) {
          case "none":
            return {
              kind: "none",
              ready: true,
              missingPackages: [],
            } satisfies GitReleaseReadiness;
          case "conventional-commits": {
            const ready = yield* commitsAreConventional({ cwd });
            return {
              kind: "conventional-commits",
              ready,
              missingPackages: [],
            } satisfies GitReleaseReadiness;
          }
          case "changesets":
            break;
          default: {
            const _exhaustive: never = policy;
            return _exhaustive;
          }
        }
        const changedFiles = yield* changedFilesSinceDefaultBranch({ cwd });
        const changesets = yield* committedChangesetsSinceDefaultBranch({
          cwd,
        });
        const packageFiles = yield* runGitCommand({
          arguments_: ["ls-files", "--", "package.json", "*/package.json"],
          cwd,
        }).pipe(
          Effect.mapError(mapGitError("Git package manifest lookup failed")),
        );
        if (packageFiles.exitCode !== 0) {
          return yield* new GitChangesetLookupError({
            message: `Git package manifest lookup failed: git ls-files exited with ${packageFiles.exitCode}`,
          });
        }
        const publishableRoots: Array<{
          readonly root: string;
          readonly name: string;
        }> = [];
        for (const manifest of packageFiles.output
          .split("\n")
          .map((file) => file.trim())
          .filter((file) => file.length > 0 && file !== "package.json")) {
          const metadata = yield* fileSystem
            .readFileString(path.join(cwd, manifest))
            .pipe(
              Effect.mapError(
                mapGitError(`Git package manifest read failed for ${manifest}`),
              ),
              Effect.flatMap((text) =>
                Effect.try({
                  try: (): unknown => JSON.parse(text),
                  catch: (cause) =>
                    new GitChangesetLookupError({
                      message: `Git package manifest parse failed for ${manifest}: ${String(cause)}`,
                    }),
                }),
              ),
              Effect.flatMap((value) => decodePackageManifest(value)),
              Effect.mapError(
                mapGitError(
                  `Git package manifest lookup failed for ${manifest}`,
                ),
              ),
            );
          if (metadata.name !== undefined && metadata.private !== true) {
            publishableRoots.push({
              root: path.dirname(manifest),
              name: metadata.name,
            });
          }
        }
        const changedPackages = publishableRoots
          .filter(({ root }) =>
            changedFiles.some((file) => file.startsWith(`${root}/`)),
          )
          .map(({ name }) => name);
        const declaredPackages = new Set(
          changesets.flatMap(({ packages }) => packages),
        );
        const missingPackages = changedPackages.filter(
          (name) => !declaredPackages.has(name),
        );
        return {
          kind: "changesets",
          ready: missingPackages.length === 0,
          missingPackages,
        } satisfies GitReleaseReadiness;
      },
    );

    const commitsAreConventional = Effect.fn(
      "GitService.commitsAreConventional",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const defaultBranchRef = yield* resolveDefaultBranchRef({ cwd });
      const result = yield* runGitCommand({
        arguments_: ["log", "--format=%s", `${defaultBranchRef}..HEAD`],
        cwd,
      }).pipe(
        Effect.mapError(mapGitError("Git conventional commit lookup failed")),
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
          /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^ )\r\n]+\))?!?: .+/.test(
            subject,
          ),
        );
    });

    return GitService.of({
      commitsAreConventional,
      changedFilesSinceDefaultBranch,
      committedChangesetsSinceDefaultBranch,
      releaseReadinessFor,
    });
  }),
).pipe(Layer.provide(BunServicesLayer));
