import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";

import { Effect, Layer, Schema } from "effect";

import type { RepositoryFleetEntry } from "../repo-map/core";
import {
  FleetGitLabService,
  FleetGitService,
  type FleetGitStatus,
  FleetPackageService,
  type FleetPortlessServer,
  FleetPortlessService,
  FleetServiceError,
  type FleetSyncPlan,
  type FleetVersion,
  type OpenMergeRequest,
} from "./core";

/** Completed Fleet subprocess invocation used by deterministic transport tests. */
export interface FleetCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** Fleet subprocess request kept behind an injectable transport seam. */
export interface FleetCommandRequest {
  readonly program: string;
  readonly arguments_: ReadonlyArray<string>;
  readonly cwd: string;
}

/** Runs one Fleet subprocess request. */
export type FleetCommandTransport = (
  request: FleetCommandRequest,
) => Effect.Effect<FleetCommandResult, FleetServiceError>;

const expandHome = (path: string): string =>
  path === "~"
    ? homedir()
    : path.startsWith("~/")
      ? `${homedir()}${path.slice(1)}`
      : path;

const serviceError = (cause: unknown): FleetServiceError =>
  new FleetServiceError({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const runProcess = (
  program: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
): Effect.Effect<FleetCommandResult, FleetServiceError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<FleetCommandResult>((resolve, reject) => {
        const child = spawn(program, [...arguments_], { cwd: expandHome(cwd) });
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
      }),
    catch: serviceError,
  });

const runFleetCommand: FleetCommandTransport = ({ program, arguments_, cwd }) =>
  runProcess(program, arguments_, cwd);

const parseJson = (text: string): Effect.Effect<unknown, FleetServiceError> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: serviceError,
  });

const successfulOutput = (
  result: FleetCommandResult,
  command: string,
): Effect.Effect<string, FleetServiceError> =>
  result.exitCode === 0
    ? Effect.succeed(result.output.trim())
    : Effect.fail(
        new FleetServiceError({
          message: `${command} failed: ${result.output.trim()}`,
        }),
      );

const pendingFromOutput = (output: string): ReadonlyArray<string> =>
  output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const resolveFleetDefaultBranch = (
  repository: RepositoryFleetEntry,
  transport: FleetCommandTransport,
): Effect.Effect<string, FleetServiceError> =>
  Effect.gen(function* () {
    const remoteHead = yield* transport({
      program: "git",
      arguments_: ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"],
      cwd: repository.path,
    });
    const remoteHeadRef = remoteHead.output
      .trim()
      .replace(/^refs\/remotes\//u, "");
    if (remoteHead.exitCode === 0 && remoteHeadRef.startsWith("origin/")) {
      return remoteHeadRef;
    }
    for (const fallbackRef of ["origin/main", "origin/master"] as const) {
      const fallback = yield* transport({
        program: "git",
        arguments_: ["rev-parse", "--verify", "--quiet", fallbackRef],
        cwd: repository.path,
      });
      if (fallback.exitCode === 0) return fallbackRef;
    }
    return yield* new FleetServiceError({
      message: `Fleet Git default branch lookup failed in ${repository.path}: origin/HEAD, origin/main, and origin/master are unavailable.`,
    });
  });

/** Reads branch, dirty state, and ahead/behind counts inside one selected Fleet repository. */
export const readFleetGitStatus = (
  repository: RepositoryFleetEntry,
  transport: FleetCommandTransport = runFleetCommand,
): Effect.Effect<FleetGitStatus, FleetServiceError> =>
  Effect.gen(function* () {
    const branchResult = yield* transport({
      program: "git",
      arguments_: ["branch", "--show-current"],
      cwd: repository.path,
    });
    const branch = yield* successfulOutput(branchResult, "Fleet git branch");
    const porcelainResult = yield* transport({
      program: "git",
      arguments_: ["status", "--porcelain"],
      cwd: repository.path,
    });
    yield* successfulOutput(porcelainResult, "Fleet git status");
    const defaultBranch = yield* resolveFleetDefaultBranch(
      repository,
      transport,
    );
    const countsResult = yield* transport({
      program: "git",
      arguments_: [
        "rev-list",
        "--left-right",
        "--count",
        `${defaultBranch}...HEAD`,
        "--",
      ],
      cwd: repository.path,
    });
    const counts = yield* successfulOutput(
      countsResult,
      `Fleet git ahead/behind in ${repository.path}`,
    );
    const [behindText, aheadText] = counts.split(/\s+/u);
    return {
      branch: branch || "HEAD",
      dirty: porcelainResult.output.trim().length > 0,
      ahead: Number.parseInt(aheadText ?? "0", 10),
      behind: Number.parseInt(behindText ?? "0", 10),
    } satisfies FleetGitStatus;
  });

const gitSyncPlanFor = (
  repository: RepositoryFleetEntry,
): Effect.Effect<FleetSyncPlan, FleetServiceError> =>
  Effect.gen(function* () {
    const status = yield* readFleetGitStatus(repository);
    const pendingResult = yield* runProcess(
      "git",
      ["status", "--short", "--branch"],
      repository.path,
    );
    return {
      repository,
      ...status,
      pending: pendingFromOutput(pendingResult.output),
    } satisfies FleetSyncPlan;
  });

const gitHardSyncFor = (
  repository: RepositoryFleetEntry,
): Effect.Effect<void, FleetServiceError> =>
  Effect.gen(function* () {
    const fetched = yield* runProcess(
      "git",
      ["fetch", "origin", "main"],
      repository.path,
    );
    yield* successfulOutput(fetched, "git fetch");
    const reset = yield* runProcess(
      "git",
      ["reset", "--hard", "origin/main"],
      repository.path,
    );
    yield* successfulOutput(reset, "git reset --hard");
    const clean = yield* runProcess("git", ["clean", "-fd"], repository.path);
    yield* successfulOutput(clean, "git clean");
  });

const MergeRequestPayload = Schema.Array(
  Schema.Struct({
    iid: Schema.Number,
    state: Schema.optional(Schema.String),
    title: Schema.optional(Schema.String),
    web_url: Schema.optional(Schema.String),
  }),
);

const decodeMergeRequests = Schema.decodeUnknownEffect(MergeRequestPayload);

/** Reads the current branch's open merge request using syntax supported by glab 1.111. */
export const openFleetMergeRequest = (
  input: {
    readonly repository: RepositoryFleetEntry;
    readonly branch: string;
  },
  transport: FleetCommandTransport = runFleetCommand,
): Effect.Effect<OpenMergeRequest | undefined, FleetServiceError> =>
  Effect.gen(function* () {
    const result = yield* transport({
      program: "glab",
      arguments_: [
        "mr",
        "list",
        "--source-branch",
        input.branch,
        "--output",
        "json",
      ],
      cwd: input.repository.path,
    });
    const output = yield* successfulOutput(
      result,
      "Fleet open merge request lookup via glab mr list",
    );
    const decoded = yield* decodeMergeRequests(yield* parseJson(output)).pipe(
      Effect.mapError(serviceError),
    );
    const first = decoded.at(0);
    return first === undefined
      ? undefined
      : ({
          iid: first.iid,
          state: first.state ?? "opened",
          title: first.title,
          webUrl: first.web_url,
        } satisfies OpenMergeRequest);
  });

const PackagePayload = Schema.Struct({
  dependencies: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  devDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  optionalDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
  peerDependencies: Schema.optional(
    Schema.Record(Schema.String, Schema.Unknown),
  ),
});
const decodePackagePayload = Schema.decodeUnknownEffect(PackagePayload);

const packageVersionFor = (input: {
  readonly repository: RepositoryFleetEntry;
  readonly packageName: string;
}): Effect.Effect<FleetVersion, FleetServiceError> =>
  Effect.gen(function* () {
    const result = yield* runProcess(
      "pnpm",
      [
        "pkg",
        "get",
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
        "--json",
      ],
      input.repository.path,
    );
    const output = yield* successfulOutput(result, "pnpm pkg get");
    const payload = yield* decodePackagePayload(yield* parseJson(output)).pipe(
      Effect.mapError(serviceError),
    );
    const scopes = [
      payload.dependencies,
      payload.devDependencies,
      payload.optionalDependencies,
      payload.peerDependencies,
    ];
    let version: string | undefined;
    for (const scope of scopes) {
      const candidate = scope?.[input.packageName];
      if (typeof candidate === "string") {
        version = candidate;
        break;
      }
    }
    return { repository: input.repository, version } satisfies FleetVersion;
  });

const installFor = (
  repository: RepositoryFleetEntry,
): Effect.Effect<void, FleetServiceError> =>
  Effect.gen(function* () {
    const result = yield* runProcess(
      "pnpm",
      ["install", "--frozen-lockfile"],
      repository.path,
    );
    yield* successfulOutput(result, "pnpm install");
  });

const PortlessPayload = Schema.Array(
  Schema.Struct({
    name: Schema.String,
    url: Schema.optional(Schema.String),
    worktreePath: Schema.optional(Schema.String),
    running: Schema.optional(Schema.Boolean),
  }),
);
const decodePortlessPayload = Schema.decodeUnknownEffect(PortlessPayload);

const listOrphaned = (): Effect.Effect<
  ReadonlyArray<FleetPortlessServer>,
  FleetServiceError
> =>
  Effect.gen(function* () {
    const result = yield* runProcess("portless", ["list", "--json"], ".");
    const output = yield* successfulOutput(result, "portless list");
    const payload = yield* decodePortlessPayload(yield* parseJson(output)).pipe(
      Effect.mapError(serviceError),
    );
    const orphans: FleetPortlessServer[] = [];
    for (const server of payload) {
      if (server.running === true) continue;
      const { worktreePath } = server;
      if (worktreePath !== undefined) {
        const exists = yield* Effect.tryPromise({
          try: async () => {
            await access(expandHome(worktreePath));
            return true;
          },
          catch: serviceError,
        }).pipe(Effect.orElseSucceed(() => false));
        if (exists) continue;
      }
      orphans.push({ name: server.name, url: server.url, worktreePath });
    }
    return orphans;
  });

const removeServer = (
  server: FleetPortlessServer,
): Effect.Effect<void, FleetServiceError> =>
  Effect.gen(function* () {
    const result = yield* runProcess("portless", ["remove", server.name], ".");
    yield* successfulOutput(result, "portless remove");
  });

/** Live subprocess implementations; policy remains in the Pi-free extension core. */
export const FleetLiveLayer = Layer.mergeAll(
  Layer.succeed(FleetGitService, {
    statusFor: ({ repository }) => readFleetGitStatus(repository),
    syncPlanFor: ({ repository }) => gitSyncPlanFor(repository),
    syncHardFor: ({ repository }) => gitHardSyncFor(repository),
  }),
  Layer.succeed(FleetGitLabService, {
    openMergeRequestFor: ({ repository, branch }) =>
      openFleetMergeRequest({ repository, branch }),
  }),
  Layer.succeed(FleetPackageService, {
    versionFor: packageVersionFor,
    installFor: ({ repository }) => installFor(repository),
  }),
  Layer.succeed(FleetPortlessService, {
    listOrphaned,
    remove: ({ server }) => removeServer(server),
  }),
);
