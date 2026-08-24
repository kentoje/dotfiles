import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import { Effect, FileSystem, Layer, Path, Schema, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  type TicketBinding,
  TicketBindingMalformedError,
  TicketBindingMissingError,
  TicketBindingWriteError,
  TicketBranchLookupError,
  TicketKeyValidationError,
  TicketService,
  TicketWorktreeDeletedError,
} from "./core";

const BindingState = Schema.Struct({
  ticket: Schema.optional(Schema.Struct({ key: Schema.String })),
  branch: Schema.optional(Schema.String),
  worktree: Schema.optional(Schema.String),
});
const decodeBindingState = Schema.decodeUnknownEffect(BindingState);

/** Filesystem and Git operations injected by tests and implemented by the live layer. */
export interface TicketStateOperations {
  readonly pathExists: (path: string) => Effect.Effect<boolean, unknown>;
  readonly readText: (path: string) => Effect.Effect<string, unknown>;
  readonly writeText: (
    path: string,
    content: string,
  ) => Effect.Effect<void, unknown>;
  readonly currentBranch: (cwd: string) => Effect.Effect<string, unknown>;
}

const ticketKeyPattern = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Validates a Jira-style ticket key without contacting Jira. */
export const validateTicketKey = (
  ticketKey: string,
): Effect.Effect<string, TicketKeyValidationError> =>
  ticketKeyPattern.test(ticketKey)
    ? Effect.succeed(ticketKey)
    : Effect.fail(new TicketKeyValidationError({ ticketKey }));

const readBinding = (ops: TicketStateOperations, worktree: string) =>
  Effect.gen(function* () {
    const statePath = `${worktree}/.dev-flow.json`;
    const exists = yield* ops.pathExists(statePath).pipe(
      Effect.mapError(
        (cause) =>
          new TicketBindingMalformedError({
            worktree,
            message: String(cause),
          }),
      ),
    );
    if (!exists) return yield* new TicketBindingMissingError({ worktree });

    const text = yield* ops.readText(statePath).pipe(
      Effect.mapError(
        (cause) =>
          new TicketBindingMalformedError({
            worktree,
            message: String(cause),
          }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: (cause) =>
        new TicketBindingMalformedError({ worktree, message: String(cause) }),
    });
    const state = yield* decodeBindingState(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new TicketBindingMalformedError({ worktree, message: String(cause) }),
      ),
    );
    const key = state.ticket?.key;
    if (
      key === undefined ||
      !ticketKeyPattern.test(key) ||
      state.branch === undefined ||
      state.worktree === undefined
    ) {
      return yield* new TicketBindingMalformedError({
        worktree,
        message: "expected ticket.key, branch, and worktree in .dev-flow.json",
      });
    }
    if (state.worktree !== worktree) {
      return yield* new TicketBindingMalformedError({
        worktree,
        message: "binding belongs to a different worktree",
      });
    }
    return {
      ticketKey: key,
      branch: state.branch,
      worktree,
    } satisfies TicketBinding;
  });

const makeTicketService = (
  ops: TicketStateOperations,
): TicketService["Service"] => {
  const bind = Effect.fn("TicketService.bind")(function* ({
    cwd,
    ticketKey,
  }: {
    readonly cwd: string;
    readonly ticketKey: string;
  }) {
    const worktree = cwd;
    yield* validateTicketKey(ticketKey);
    const exists = yield* ops
      .pathExists(worktree)
      .pipe(
        Effect.mapError(() => new TicketWorktreeDeletedError({ worktree })),
      );
    if (!exists) return yield* new TicketWorktreeDeletedError({ worktree });
    const branch = yield* ops
      .currentBranch(worktree)
      .pipe(
        Effect.mapError(
          (cause) =>
            new TicketBranchLookupError({ worktree, message: String(cause) }),
        ),
      );
    if (branch.length === 0) {
      return yield* new TicketBranchLookupError({
        worktree,
        message: "empty branch name",
      });
    }
    const binding: TicketBinding = { ticketKey, branch, worktree };
    const content = `${JSON.stringify(
      { ticket: { key: ticketKey }, branch, worktree },
      null,
      2,
    )}\n`;
    yield* ops
      .writeText(`${worktree}/.dev-flow.json`, content)
      .pipe(
        Effect.mapError(
          (cause) =>
            new TicketBindingWriteError({ worktree, message: String(cause) }),
        ),
      );
    return binding;
  });

  const current = Effect.fn("TicketService.current")(function* ({
    cwd,
  }: {
    readonly cwd: string;
  }) {
    const worktree = cwd;
    const exists = yield* ops
      .pathExists(worktree)
      .pipe(
        Effect.mapError(() => new TicketWorktreeDeletedError({ worktree })),
      );
    if (!exists) return yield* new TicketWorktreeDeletedError({ worktree });
    return yield* readBinding(ops, worktree);
  });

  return TicketService.of({ bind, current });
};

/** Builds a ticket service from injected operations for deterministic tests. */
export const TicketLiveLayerWithOperations = (
  operations: TicketStateOperations,
): Layer.Layer<TicketService> =>
  Layer.succeed(TicketService, makeTicketService(operations));

/** Live ticket state backed by the worktree's .dev-flow.json and Git branch. */
export const TicketLiveLayer = Layer.effect(
  TicketService,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const operations: TicketStateOperations = {
      pathExists: (targetPath) => fileSystem.exists(targetPath),
      readText: (targetPath) => fileSystem.readFileString(targetPath),
      writeText: (targetPath, content) =>
        fileSystem.writeFileString(targetPath, content),
      currentBranch: (cwd) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* childProcessSpawner.spawn(
              ChildProcess.make("git", ["branch", "--show-current"], {
                cwd: path.resolve(cwd),
              }),
            );
            const output = yield* handle.stdout.pipe(
              Stream.decodeText(),
              Stream.runCollect,
              Effect.map((chunks) => chunks.join("")),
            );
            const exitCode = yield* handle.exitCode;
            if (exitCode !== 0) {
              return yield* Effect.fail(
                new Error(`git exited with ${exitCode}`),
              );
            }
            return output.trim();
          }),
        ),
    };
    return makeTicketService(operations);
  }),
).pipe(Layer.provide(BunServicesLayer));
