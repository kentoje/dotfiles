import { resolve } from "node:path";

import { NodeServices } from "@effect/platform-node";
import type { Scope } from "effect";
import { Effect, Schema } from "effect";
import type { ChildProcessSpawner } from "effect/process";

import { createManagedWorktree } from "./creation/create.js";
import {
  inspectWorktreeRecord,
  requireManagedWorktree,
} from "./inspection/inspect.js";
import { boundWorktreeInvocation } from "./invocation/bound.js";
import { listManagedWorktrees } from "./listing/list.js";
import {
  WorktreeListInput,
  WorktreeNewInput,
  WorktreePathInput,
  worktreeFailure,
} from "./model.js";
import type {
  WorktreeFailure,
  WorktreeHost,
  WorktreeInvocation,
  WorktreeProgress,
  WorktreeResult,
} from "./model.js";
import { canonicalWorktreePath, worktreeFilesystem } from "./paths/resolve.js";
import { removeManagedWorktree } from "./removal/remove.js";
import { acquireWorktreeLock } from "./state/store.js";

export type {
  WorktreeHost,
  WorktreeInvocation,
  WorktreeResult,
  WorktreeRecord,
} from "./model.js";

/** Preserve partial completion before classifying cancellation or preflight failure. */
function resolveWorktreeFailureStatus(
  progress: WorktreeProgress,
  code: string
): "partial" | "cancelled" | "error" | "blocked" {
  if (progress.effects.length) {
    return "partial";
  }
  if (code === "CANCELLED") {
    return "cancelled";
  }
  if (
    [
      "LOOKUP_FAILED",
      "PROCESS_FAILED",
      "FILESYSTEM_FAILED",
      "OUTPUT_LIMIT",
    ].includes(code)
  ) {
    return "error";
  }
  return "blocked";
}

/** Worktree v1 uses resolved trusted host context; discovery and Pi registration remain separate. */
export function makeWorktreeModule(host: WorktreeHost) {
  const run = <T>(
    body: (
      progress: WorktreeProgress
    ) => Effect.Effect<
      T,
      WorktreeFailure,
      ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
    >,
    invocation: WorktreeInvocation,
    recovered: (progress: WorktreeProgress) => T | null = () => null,
    defaultMilliseconds = 30_000
  ): Effect.Effect<WorktreeResult<T>> =>
    Effect.suspend(() => {
      const progress: WorktreeProgress = {
        cleanupFailed: false,
        effects: [],
        phase: "preflight",
        record: null,
        removal: null,
        warnings: [],
      };
      const context = {
        repository: host.repositoryId,
        repository_path: host.repositoryPath,
      };
      return boundWorktreeInvocation(
        Effect.scoped(body(progress)).pipe(
          Effect.flatMap((data) =>
            progress.cleanupFailed
              ? Effect.fail(
                  worktreeFailure(
                    "CLEANUP_FAILED",
                    "Worktree operation completed but mutation lock cleanup failed."
                  )
                )
              : Effect.succeed(data)
          )
        ),
        invocation,
        defaultMilliseconds
      ).pipe(
        Effect.map(
          (data) =>
            ({
              completed_effects: progress.effects,
              context,
              data,
              error: null,
              status: "ok",
              warnings: progress.warnings,
            }) satisfies WorktreeResult<T>
        ),
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is Effect.catch, not a Promise callback.
        Effect.catch((error) =>
          Effect.succeed({
            completed_effects: progress.effects,
            context,
            data: recovered(progress),
            error: {
              code: error.code,
              message: error.message,
              phase: progress.phase,
              retryable: false,
            },
            status: resolveWorktreeFailureStatus(progress, error.code),
            warnings: progress.warnings,
          } satisfies WorktreeResult<T>)
        ),
        Effect.provide(NodeServices.layer)
      );
    });
  const validateContext = Effect.fn("validateWorktreeContext")(
    function* validateContext(request: { cwd?: string; repository?: string }) {
      if (request.repository && request.repository !== host.repositoryId) {
        return yield* worktreeFailure(
          "CONTEXT_CONFLICT",
          "Request repository differs from the resolved host context."
        );
      }
      const { cwd } = request;
      if (cwd) {
        const requested = yield* worktreeFilesystem(() =>
          canonicalWorktreePath(resolve(host.sessionCwd, cwd))
        );
        const selected = yield* worktreeFilesystem(() =>
          canonicalWorktreePath(host.repositoryPath)
        );
        if (requested !== selected) {
          return yield* worktreeFailure(
            "CONTEXT_CONFLICT",
            "Resolve the explicitly selected cwd before invoking this module."
          );
        }
      }
    }
  );
  return {
    list: (input: unknown = {}, invocation: WorktreeInvocation = {}) =>
      run(
        (progress) =>
          Effect.gen(function* list() {
            const request = yield* Schema.decodeUnknownEffect(
              WorktreeListInput,
              { onExcessProperty: "error" }
            )(input).pipe(
              Effect.mapError(() =>
                worktreeFailure(
                  "INVALID_INPUT",
                  "Invalid worktree list request."
                )
              )
            );
            yield* validateContext(request);
            return yield* listManagedWorktrees(host, progress);
          }),
        invocation
      ),
    new: (input: unknown, invocation: WorktreeInvocation = {}) =>
      run(
        (progress) =>
          Effect.gen(function* inspectRequestedWorktree() {
            const request = yield* Schema.decodeUnknownEffect(
              WorktreeNewInput,
              { onExcessProperty: "error" }
            )(input).pipe(
              Effect.mapError(() =>
                worktreeFailure(
                  "UNSAFE_TASK",
                  "Worktree request contains invalid fields or an unsafe task."
                )
              )
            );
            yield* validateContext(request);
            yield* acquireWorktreeLock(host.repositoryPath, progress);
            return yield* createManagedWorktree(host, request, progress);
          }),
        invocation,
        (progress) => progress.record,
        60_000
      ),
    rm: (input: unknown, invocation: WorktreeInvocation = {}) =>
      run(
        (progress) =>
          Effect.gen(function* rm() {
            const request = yield* Schema.decodeUnknownEffect(
              WorktreePathInput,
              { onExcessProperty: "error" }
            )(input).pipe(
              Effect.mapError(() =>
                worktreeFailure(
                  "INVALID_INPUT",
                  "Invalid worktree removal request."
                )
              )
            );
            yield* validateContext(request);
            yield* acquireWorktreeLock(host.repositoryPath, progress);
            progress.phase = "remove";
            return yield* removeManagedWorktree(host, request.path, progress);
          }),
        invocation,
        (progress) => progress.removal,
        60_000
      ),
    verify: (input: unknown, invocation: WorktreeInvocation = {}) =>
      run(
        () =>
          Effect.gen(function* verify() {
            const request = yield* Schema.decodeUnknownEffect(
              WorktreePathInput,
              { onExcessProperty: "error" }
            )(input).pipe(
              Effect.mapError(() =>
                worktreeFailure(
                  "INVALID_INPUT",
                  "Invalid worktree inspection request."
                )
              )
            );
            yield* validateContext(request);
            const { record } = yield* requireManagedWorktree(
              host,
              request.path
            );
            return yield* inspectWorktreeRecord(host, record);
          }),
        invocation
      ),
  };
}
