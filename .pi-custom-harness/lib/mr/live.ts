import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, Layer, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  MergeRequestCommitError,
  MergeRequestCommitService,
  MergeRequestGitLabError,
  type MergeRequestPipelineState,
  type MergeRequestReplyResult,
  MergeRequestService,
  type MergeRequestStatus,
  type MergeRequestThread,
  type MergeRequestUpdateResult,
} from "./core";
export interface MergeRequestCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** Safe command request shared by deterministic transport tests and the live layer. */
export interface MergeRequestCommandRequest {
  readonly cwd: string;
  readonly arguments_: ReadonlyArray<string>;
}

/** Runs one command without exposing subprocess details to MR policy code. */
export type MergeRequestCommandTransport = (
  request: MergeRequestCommandRequest,
) => Effect.Effect<MergeRequestCommandResult, unknown>;

const decodeJson = (output: string): unknown => JSON.parse(output);

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberOrUndefined = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const pipelineState = (value: unknown): MergeRequestPipelineState => {
  if (
    value === "created" ||
    value === "waiting_for_resource" ||
    value === "preparing" ||
    value === "pending" ||
    value === "running" ||
    value === "success" ||
    value === "failed" ||
    value === "canceled" ||
    value === "skipped" ||
    value === "manual" ||
    value === "scheduled"
  ) {
    return value;
  }
  return "unknown";
};

const lookupFailure = (message: string): MergeRequestGitLabError =>
  new MergeRequestGitLabError({
    message: `Merge request lookup failed: ${message}`,
  });

const makeMergeRequestService = (
  transport: MergeRequestCommandTransport,
): MergeRequestService["Service"] => {
  const run = (request: MergeRequestCommandRequest) =>
    transport(request).pipe(
      Effect.mapError((cause) =>
        lookupFailure(cause instanceof Error ? cause.message : String(cause)),
      ),
      Effect.flatMap((result) =>
        result.exitCode === 0
          ? Effect.succeed(result.output)
          : Effect.fail(
              lookupFailure(`command exited with ${result.exitCode}`),
            ),
      ),
    );

  const readMergeRequest = (cwd: string) =>
    run({
      cwd,
      arguments_: ["api", "merge_requests", "--current", "--output", "json"],
    }).pipe(
      Effect.flatMap((output) =>
        Effect.try({
          try: () => decodeJson(output),
          catch: (cause) =>
            lookupFailure(`response JSON is malformed: ${String(cause)}`),
        }),
      ),
      Effect.flatMap((payload) => {
        const object = objectValue(payload);
        const iid = numberOrUndefined(object?.iid);
        const title = stringOrUndefined(object?.title);
        if (iid === undefined || title === undefined) {
          return Effect.fail(lookupFailure("response is missing iid or title"));
        }
        const discussionsOk = object?.discussions_ok !== false;
        const unresolvedCount =
          numberOrUndefined(object?.unresolved_count) ?? 0;
        const boundTicket = stringOrUndefined(object?.bound_ticket);
        const draft = object?.draft === true;
        const pipeline = objectValue(object?.pipeline);
        return Effect.succeed({
          iid,
          title,
          draft,
          discussionsOk,
          pipelineState: pipelineState(
            pipeline?.status ?? object?.pipeline_state,
          ),
          unresolvedCount,
          boundTicket,
        } satisfies MergeRequestStatus);
      }),
    );

  return MergeRequestService.of({
    statusFor: ({ cwd }) => readMergeRequest(cwd),
    threadsFor: ({ cwd }) =>
      run({
        cwd,
        arguments_: [
          "api",
          "merge_requests",
          "--current",
          "--discussions",
          "--output",
          "json",
        ],
      }).pipe(
        Effect.flatMap((output) =>
          Effect.try({
            try: () => decodeJson(output),
            catch: (cause) =>
              lookupFailure(`threads JSON is malformed: ${String(cause)}`),
          }),
        ),
        Effect.map((payload) => {
          const rows = Array.isArray(payload) ? payload : [];
          return rows.flatMap((row): ReadonlyArray<MergeRequestThread> => {
            const thread = objectValue(row);
            const note = objectValue(thread?.note);
            const author = objectValue(note?.author);
            const position = objectValue(thread?.position);
            const id =
              stringOrUndefined(thread?.id) ?? stringOrUndefined(note?.id);
            const body = stringOrUndefined(note?.body);
            if (id === undefined || body === undefined) return [];
            return [
              {
                id,
                author: stringOrUndefined(author?.username) ?? "unknown",
                isBot: author?.bot === true || author?.type === "Bot",
                file:
                  stringOrUndefined(position?.new_path) ??
                  stringOrUndefined(position?.old_path),
                line:
                  numberOrUndefined(position?.new_line) ??
                  numberOrUndefined(position?.old_line),
                body,
                resolved: thread?.resolved === true,
              },
            ];
          });
        }),
      ),
    replyTo: ({ cwd, threadId, body, resolve }) =>
      run({
        cwd,
        arguments_: [
          "api",
          "merge_requests",
          "--current",
          "--thread",
          threadId,
          "--reply",
          body,
          ...(resolve ? ["--resolve"] : []),
        ],
      }).pipe(
        Effect.map(
          () =>
            ({ threadId, resolved: resolve }) satisfies MergeRequestReplyResult,
        ),
      ),
    updateWith: ({ cwd, title, description }) =>
      run({
        cwd,
        arguments_: [
          "mr",
          "update",
          "--title",
          title,
          "--description",
          description,
          "--output",
          "json",
        ],
      }).pipe(
        Effect.flatMap((output) =>
          Effect.try({
            try: () => decodeJson(output),
            catch: (cause) =>
              lookupFailure(`update JSON is malformed: ${String(cause)}`),
          }),
        ),
        Effect.flatMap((payload) => {
          const object = objectValue(payload);
          const iid = numberOrUndefined(object?.iid);
          if (iid === undefined)
            return Effect.fail(lookupFailure("update response is missing iid"));
          return Effect.succeed({
            iid,
            title,
            description,
          } satisfies MergeRequestUpdateResult);
        }),
      ),
    pipelineFor: ({ cwd }) =>
      readMergeRequest(cwd).pipe(
        Effect.map((status) => ({
          iid: status.iid,
          state: status.pipelineState,
        })),
      ),
  });
};

const makeCommitService = (
  transport: MergeRequestCommandTransport,
): MergeRequestCommitService["Service"] =>
  MergeRequestCommitService.of({
    currentBranchCommits: ({ cwd }) =>
      transport({
        cwd,
        arguments_: ["log", "--format=%s%x00%b%x00", "--no-decorate"],
      }).pipe(
        Effect.mapError(
          (cause) =>
            new MergeRequestCommitError({
              message: `Commit lookup failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            }),
        ),
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return Effect.fail(
              new MergeRequestCommitError({
                message: `Commit lookup failed: git log exited with ${result.exitCode}`,
              }),
            );
          }

          const parts = result.output.split("\u0000");
          const commits: Array<{ subject: string; body: string }> = [];
          for (let index = 0; index < parts.length; index += 2) {
            const subject = parts[index];
            if (subject === undefined || subject.length === 0) continue;
            commits.push({
              subject,
              body: parts[index + 1] ?? "",
            });
          }
          return Effect.succeed(commits);
        }),
      ),
  });

/** Builds MR and commit services from an injected command transport for deterministic tests. */
export const MergeRequestLiveLayerWithTransport = (
  transport: MergeRequestCommandTransport,
): Layer.Layer<MergeRequestService | MergeRequestCommitService> =>
  Layer.merge(
    Layer.succeed(MergeRequestService, makeMergeRequestService(transport)),
    Layer.succeed(MergeRequestCommitService, makeCommitService(transport)),
  );

/** Builds the live MR service from host glab subprocesses. */
export const MergeRequestLiveLayer = Layer.effect(
  MergeRequestService,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const transport: MergeRequestCommandTransport = ({ cwd, arguments_ }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("glab", arguments_, { cwd }),
          );
          const output = yield* handle.all.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;
          return { exitCode, output };
        }),
      );
    return makeMergeRequestService(transport);
  }),
).pipe(Layer.provide(BunServicesLayer));

/** Builds the live commit service from host git subprocesses. */
export const MergeRequestCommitLiveLayer = Layer.effect(
  MergeRequestCommitService,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const transport: MergeRequestCommandTransport = ({ cwd, arguments_ }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner.spawn(
            ChildProcess.make("git", arguments_, { cwd }),
          );
          const output = yield* handle.all.pipe(
            Stream.decodeText(),
            Stream.runCollect,
            Effect.map((chunks) => chunks.join("")),
          );
          const exitCode = yield* handle.exitCode;
          return { exitCode, output };
        }),
      );
    return makeCommitService(transport);
  }),
).pipe(Layer.provide(BunServicesLayer));
