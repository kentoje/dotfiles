import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  WorktreeCommandService,
  WorktreeFileSystemService,
  WorktreeGitService,
  WorktreeMutationService,
  WorktreePortlessService,
} from "./core";

test("worktree live seams expose deterministic command and filesystem behavior", async () => {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const fileSystem = yield* WorktreeFileSystemService;
      const command = yield* WorktreeCommandService;
      const git = yield* WorktreeGitService;
      const portless = yield* WorktreePortlessService;
      const mutation = yield* WorktreeMutationService;
      return {
        exists: yield* fileSystem.exists({ path: "/tmp/worktree-contract" }),
        command: yield* command.run({
          program: "fake",
          arguments_: [],
          cwd: "/tmp/worktree-contract",
        }),
        worktrees: yield* git.listWorktrees({ root: "/tmp/worktree-contract" }),
        registered: yield* portless
          .register({
            name: "contract",
            url: "http://contract.localhost",
            worktreePath: "/tmp/worktree-contract",
          })
          .pipe(Effect.as(true)),
        mutation: yield* mutation.run({
          path: "/tmp/worktree-contract",
          operation: Effect.succeed("queued"),
        }),
      };
    }).pipe(
      Effect.provideService(WorktreeFileSystemService, {
        exists: () => Effect.succeed(true),
      }),
      Effect.provideService(WorktreeCommandService, {
        run: () => Effect.succeed({ exitCode: 0, output: "ok" }),
      }),
      Effect.provideService(WorktreeGitService, {
        resolveRepositoryRoot: () => Effect.succeed("/tmp/repository"),
        createWorktree: () => Effect.void,
        listWorktrees: () =>
          Effect.succeed([
            { path: "/tmp/worktree-contract", branch: "contract" },
          ]),
        removeWorktree: () => Effect.void,
      }),
      Effect.provideService(WorktreePortlessService, {
        register: () => Effect.void,
      }),
      Effect.provideService(WorktreeMutationService, {
        run: ({ operation }) => operation,
      }),
    ),
  );

  expect(result).toEqual({
    exists: true,
    command: { exitCode: 0, output: "ok" },
    worktrees: [{ path: "/tmp/worktree-contract", branch: "contract" }],
    registered: true,
    mutation: "queued",
  });
});
