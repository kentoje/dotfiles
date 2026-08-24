import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, Layer, Option, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type CurrentBranchMergeRequest,
  GitLabMergeRequestLookupError,
  GitLabService,
} from "./core";

const CurrentBranchName = Schema.NonEmptyString;
const decodeCurrentBranchName = Schema.decodeUnknownEffect(CurrentBranchName);

const GitLabMergeRequestPayload = Schema.Array(
  Schema.Struct({ iid: Schema.Number }),
);
const decodeGitLabMergeRequestPayload = Schema.decodeUnknownEffect(
  GitLabMergeRequestPayload,
);

/** A completed CLI invocation used by the GitLab lookup transport seam. */
export interface GitLabCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

export interface GitLabCommandRequest {
  readonly program: "git" | "glab";
  readonly cwd: string;
  readonly arguments_: ReadonlyArray<string>;
}

/** Runs one GitLab-safe CLI query without exposing subprocess details to policy code. */
export type GitLabCommandTransport = (
  request: GitLabCommandRequest,
) => Effect.Effect<GitLabCommandResult, unknown>;

const lookupFailure = (message: string): GitLabMergeRequestLookupError =>
  new GitLabMergeRequestLookupError({
    message: `GitLab MR lookup failed: ${message}`,
  });

const describeTransportFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const makeGitLabService = (
  transport: GitLabCommandTransport,
): GitLabService["Service"] => {
  const runGitLabCommand = Effect.fn("GitLabCommandTransport.run")(function* (
    request: GitLabCommandRequest,
  ) {
    return yield* transport(request).pipe(
      Effect.mapError((cause) =>
        lookupFailure(describeTransportFailure(cause)),
      ),
    );
  });

  const findOpenMergeRequestForCurrentBranch = Effect.fn(
    "GitLabService.findOpenMergeRequestForCurrentBranch",
  )(function* ({ cwd }: { readonly cwd: string }) {
    const branchResult = yield* runGitLabCommand({
      program: "git",
      cwd,
      arguments_: ["branch", "--show-current"],
    });

    if (branchResult.exitCode !== 0) {
      return yield* lookupFailure(
        `git branch --show-current exited with ${branchResult.exitCode}`,
      );
    }

    const sourceBranch = yield* decodeCurrentBranchName(
      branchResult.output.trim(),
    ).pipe(
      Effect.mapError((cause) =>
        lookupFailure(`current branch output is invalid: ${cause.message}`),
      ),
    );

    const mergeRequestResult = yield* runGitLabCommand({
      program: "glab",
      cwd,
      arguments_: [
        "mr",
        "list",
        "--source-branch",
        sourceBranch,
        "--output",
        "json",
      ],
    });

    if (mergeRequestResult.exitCode !== 0) {
      return yield* lookupFailure(
        `glab mr list exited with ${mergeRequestResult.exitCode}`,
      );
    }

    const parsedPayload = yield* Effect.try({
      try: () => JSON.parse(mergeRequestResult.output),
      catch: (cause) =>
        lookupFailure(`merge request list JSON is malformed: ${String(cause)}`),
    });
    const mergeRequests = yield* decodeGitLabMergeRequestPayload(
      parsedPayload,
    ).pipe(
      Effect.mapError((cause) =>
        lookupFailure(
          `merge request list payload is unsupported: ${cause.message}`,
        ),
      ),
    );

    const firstMergeRequest = mergeRequests[0];
    return firstMergeRequest === undefined
      ? Option.none<CurrentBranchMergeRequest>()
      : Option.some(firstMergeRequest);
  });

  return GitLabService.of({ findOpenMergeRequestForCurrentBranch });
};

/** Builds a GitLab service from an injected CLI transport for deterministic tests. */
export const GitLabLiveLayerWithTransport = (
  transport: GitLabCommandTransport,
): Layer.Layer<GitLabService> =>
  Layer.succeed(GitLabService, makeGitLabService(transport));

/** Queries GitLab for open merge requests attached to the current branch. */
export const GitLabLiveLayer = Layer.effect(
  GitLabService,
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    const transport: GitLabCommandTransport = ({ program, cwd, arguments_ }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const command = ChildProcess.make(program, arguments_, { cwd });
          const handle = yield* childProcessSpawner.spawn(command);
          const output = yield* handle.stdout.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;
          return { exitCode, output };
        }),
      );

    return makeGitLabService(transport);
  }),
).pipe(Layer.provide(BunServicesLayer));
