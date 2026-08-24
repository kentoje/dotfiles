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

type ProcessResult = Readonly<{ exitCode: number; output: string }>;

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
): Effect.Effect<ProcessResult, FleetServiceError> =>
  Effect.tryPromise({
    try: () =>
      new Promise<ProcessResult>((resolve, reject) => {
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

const parseJson = (text: string): Effect.Effect<unknown, FleetServiceError> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: serviceError,
  });

const successfulOutput = (
  result: ProcessResult,
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

const gitStatusFor = (
  repository: RepositoryFleetEntry,
): Effect.Effect<FleetGitStatus, FleetServiceError> =>
  Effect.gen(function* () {
    const branchResult = yield* runProcess(
      "git",
      ["branch", "--show-current"],
      repository.path,
    );
    const branch = yield* successfulOutput(branchResult, "git branch");
    const porcelainResult = yield* runProcess(
      "git",
      ["status", "--porcelain"],
      repository.path,
    );
    const countsResult = yield* runProcess(
      "git",
      ["rev-list", "--left-right", "--count", "main...HEAD"],
      repository.path,
    );
    const counts = yield* successfulOutput(countsResult, "git rev-list");
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
    const status = yield* gitStatusFor(repository);
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

const mergeRequestFor = (input: {
  readonly repository: RepositoryFleetEntry;
  readonly branch: string;
}): Effect.Effect<OpenMergeRequest | undefined, FleetServiceError> =>
  Effect.gen(function* () {
    const result = yield* runProcess(
      "glab",
      [
        "mr",
        "list",
        "--state",
        "opened",
        "--source-branch",
        input.branch,
        "--output",
        "json",
      ],
      input.repository.path,
    );
    const output = yield* successfulOutput(result, "glab mr list");
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
    statusFor: ({ repository }) => gitStatusFor(repository),
    syncPlanFor: ({ repository }) => gitSyncPlanFor(repository),
    syncHardFor: ({ repository }) => gitHardSyncFor(repository),
  }),
  Layer.succeed(FleetGitLabService, {
    openMergeRequestFor: ({ repository, branch }) =>
      mergeRequestFor({ repository, branch }),
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
