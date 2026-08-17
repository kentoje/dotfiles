import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type CurrentBranchMergeRequest,
  GitLabMergeRequestLookupError,
  GitLabService,
} from "./core";

const GitLabMergeRequestPayload = Schema.Struct({ iid: Schema.Number });
const decodeGitLabMergeRequestPayload = Schema.decodeUnknownEffect(
  GitLabMergeRequestPayload,
);

/** Queries GitLab for an existing open merge request attached to the current branch. */
export const GitLabLiveLayer = Layer.effect(
  GitLabService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const findOpenMergeRequestForCurrentBranch = Effect.fn(
      "GitLabService.findOpenMergeRequestForCurrentBranch",
    )(function* ({ cwd }: { readonly cwd: string }) {
      const command = ChildProcess.make(
        "glab",
        ["mr", "view", "--output", "json", "--fields", "iid,state"],
        { cwd },
      );
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.all.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;

          return { exitCode, output };
        }),
      ).pipe(
        Effect.mapError(
          (cause) =>
            new GitLabMergeRequestLookupError({
              message: `GitLab MR lookup failed: ${cause.message}`,
            }),
        ),
      );

      if (
        result.exitCode === 1 &&
        result.output.includes("no merge requests found")
      ) {
        return Option.none<CurrentBranchMergeRequest>();
      }
      if (result.exitCode !== 0) {
        return yield* new GitLabMergeRequestLookupError({
          message: `GitLab MR lookup failed: glab mr view exited with ${result.exitCode}`,
        });
      }

      const parsedPayload = yield* Effect.try({
        try: () => JSON.parse(result.output),
        catch: (cause) =>
          new GitLabMergeRequestLookupError({
            message: `GitLab MR lookup failed: ${String(cause)}`,
          }),
      });
      const mergeRequest = yield* decodeGitLabMergeRequestPayload(
        parsedPayload,
      ).pipe(
        Effect.mapError(
          (cause) =>
            new GitLabMergeRequestLookupError({
              message: `GitLab MR lookup failed: ${cause.message}`,
            }),
        ),
      );

      return Option.some(mergeRequest);
    });

    return GitLabService.of({ findOpenMergeRequestForCurrentBranch });
  }),
).pipe(Layer.provide(BunServicesLayer));
