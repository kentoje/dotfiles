import { spawn } from "node:child_process";

import { Effect, Layer } from "effect";

import {
  TaskPreflightError,
  type TaskPreflightMatches,
  type TaskPreflightMergeRequest,
  TaskPreflightService,
  type TaskPreflightTicket,
  type TaskPreflightWorktree,
} from "./core";

interface TaskPreflightCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** Command request used by deterministic task preflight transport tests. */
export interface TaskPreflightCommandRequest {
  readonly program: "git" | "jira" | "glab";
  readonly cwd: string;
  readonly arguments_: ReadonlyArray<string>;
}

/** Runs one read-only local or remote lookup for task preflight. */
export type TaskPreflightCommandTransport = (
  request: TaskPreflightCommandRequest,
) => Effect.Effect<TaskPreflightCommandResult, unknown>;

const taskPreflightFailure = (message: string): TaskPreflightError =>
  new TaskPreflightError({ message: `Task preflight failed: ${message}` });

const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : undefined;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const taskQueryKey = (query: string): string =>
  query.toUpperCase().match(/[A-Z][A-Z0-9_]*-\d+/u)?.[0] ?? query.trim();

const runSuccessfulCommand = (
  transport: TaskPreflightCommandTransport,
  request: TaskPreflightCommandRequest,
) =>
  transport(request).pipe(
    Effect.mapError((cause) =>
      taskPreflightFailure(
        `${request.program} ${request.arguments_.join(" ")} in ${request.cwd}: ${cause instanceof Error ? cause.message : String(cause)}`,
      ),
    ),
    Effect.flatMap((result) =>
      result.exitCode === 0
        ? Effect.succeed(result.output)
        : Effect.fail(
            taskPreflightFailure(
              `${request.program} ${request.arguments_.join(" ")} exited with ${result.exitCode} in ${request.cwd}: ${result.output.trim()}`,
            ),
          ),
    ),
  );

const parseWorktrees = (
  output: string,
  query: string,
): ReadonlyArray<TaskPreflightWorktree> => {
  const normalizedQuery = taskQueryKey(query).toLowerCase();
  return output.split(/\n\n/u).flatMap((block) => {
    const path = block.match(/^worktree (.+)$/mu)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/mu)?.[1];
    if (
      path === undefined ||
      !`${path}\n${branch ?? ""}`.toLowerCase().includes(normalizedQuery)
    ) {
      return [];
    }
    return [{ path, branch }];
  });
};

const parseTickets = (output: string): ReadonlyArray<TaskPreflightTicket> => {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    const issue = objectValue(row);
    const fields = objectValue(issue?.fields);
    const key = stringValue(issue?.key);
    const summary = stringValue(fields?.summary);
    return key === undefined || summary === undefined ? [] : [{ key, summary }];
  });
};

const parseMergeRequests = (
  output: string,
): ReadonlyArray<TaskPreflightMergeRequest> => {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((row) => {
    const mergeRequest = objectValue(row);
    const iid = numberValue(mergeRequest?.iid);
    const title = stringValue(mergeRequest?.title);
    const sourceBranch = stringValue(mergeRequest?.source_branch);
    return iid === undefined ||
      title === undefined ||
      sourceBranch === undefined
      ? []
      : [{ iid, title, sourceBranch }];
  });
};

const makeTaskPreflightService = (
  transport: TaskPreflightCommandTransport,
): TaskPreflightService["Service"] =>
  TaskPreflightService.of({
    search: ({ cwd, query }) =>
      Effect.gen(function* () {
        const normalizedQuery = taskQueryKey(query);
        const repositoryRoot = (yield* runSuccessfulCommand(transport, {
          program: "git",
          cwd,
          arguments_: ["rev-parse", "--show-toplevel"],
        })).trim();
        const [worktreeOutput, ticketOutput, mergeRequestOutput] =
          yield* Effect.all(
            [
              runSuccessfulCommand(transport, {
                program: "git",
                cwd: repositoryRoot,
                arguments_: ["worktree", "list", "--porcelain"],
              }),
              runSuccessfulCommand(transport, {
                program: "jira",
                cwd: repositoryRoot,
                arguments_: /^[A-Z][A-Z0-9_]*-\d+$/u.test(normalizedQuery)
                  ? [
                      "issue",
                      "list",
                      "--jql",
                      `key = ${normalizedQuery}`,
                      "--raw",
                      "--paginate",
                      "0:20",
                    ]
                  : [
                      "issue",
                      "list",
                      normalizedQuery,
                      "--raw",
                      "--paginate",
                      "0:20",
                    ],
              }),
              runSuccessfulCommand(transport, {
                program: "glab",
                cwd: repositoryRoot,
                arguments_: [
                  "mr",
                  "list",
                  "--search",
                  normalizedQuery,
                  "--output",
                  "json",
                  "--per-page",
                  "20",
                ],
              }),
            ],
            { concurrency: "unbounded" },
          );
        const matches: TaskPreflightMatches = {
          worktrees: parseWorktrees(worktreeOutput, normalizedQuery),
          tickets: yield* Effect.try({
            try: () => parseTickets(ticketOutput),
            catch: (cause) =>
              taskPreflightFailure(
                `Jira response is malformed: ${String(cause)}`,
              ),
          }),
          mergeRequests: yield* Effect.try({
            try: () => parseMergeRequests(mergeRequestOutput),
            catch: (cause) =>
              taskPreflightFailure(
                `GitLab response is malformed: ${String(cause)}`,
              ),
          }),
        };
        return matches;
      }),
  });

/** Builds task preflight from an injected command transport. */
export const TaskPreflightLiveLayerWithTransport = (
  transport: TaskPreflightCommandTransport,
): Layer.Layer<TaskPreflightService> =>
  Layer.succeed(TaskPreflightService, makeTaskPreflightService(transport));

/** Searches Git, Jira, and GitLab before task resource creation. */
export const TaskPreflightLiveLayer = Layer.succeed(
  TaskPreflightService,
  makeTaskPreflightService(({ program, cwd, arguments_ }) =>
    Effect.tryPromise({
      try: () => {
        const { promise, resolve, reject } =
          Promise.withResolvers<TaskPreflightCommandResult>();
        const child = spawn(program, [...arguments_], { cwd });
        let output = "";
        child.stdout.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (exitCode) =>
          resolve({ exitCode: exitCode ?? 1, output }),
        );
        return promise;
      },
      catch: (cause) => cause,
    }),
  ),
);
