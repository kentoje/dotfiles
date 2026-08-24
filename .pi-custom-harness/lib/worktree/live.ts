import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";

import { Effect, Layer } from "effect";
import {
  WorktreeCommandError,
  type WorktreeCommandResult,
  WorktreeCommandService,
  WorktreeFileSystemService,
  WorktreeGitError,
  WorktreeGitService,
  WorktreeMutationService,
  WorktreePortlessService,
  type WorktreeRecord,
} from "./core";

const expandHome = (path: string): string =>
  path === "~"
    ? homedir()
    : path.startsWith("~/")
      ? `${homedir()}${path.slice(1)}`
      : path;

const commandFailure = (cause: unknown): WorktreeCommandError =>
  new WorktreeCommandError({
    message: `Worktree command failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  });

const runProcess = (
  program: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
) =>
  Effect.tryPromise({
    try: () =>
      new Promise<WorktreeCommandResult>((resolve, reject) => {
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
      }),
    catch: commandFailure,
  });

/** Live filesystem, Git, setup-command, portless, and mutation services. */
export const WorktreeLiveLayer = Layer.mergeAll(
  Layer.succeed(WorktreeFileSystemService, {
    exists: ({ path }) =>
      Effect.promise(async () => {
        try {
          await access(expandHome(path), constants.F_OK);
          return true;
        } catch {
          return false;
        }
      }),
  }),
  Layer.succeed(WorktreeCommandService, {
    run: ({ program, arguments_, cwd }) =>
      runProcess(program, arguments_, expandHome(cwd)),
  }),
  Layer.succeed(WorktreeGitService, {
    resolveRepositoryRoot: ({ cwd }) =>
      runProcess("git", ["rev-parse", "--show-toplevel"], expandHome(cwd)).pipe(
        Effect.map((result) => result.output.trim()),
        Effect.filterOrFail(
          (root) => root.length > 0,
          () =>
            new WorktreeGitError({ message: "Git repository root was empty." }),
        ),
        Effect.mapError((cause) =>
          cause instanceof WorktreeGitError
            ? cause
            : new WorktreeGitError({
                message: cause instanceof Error ? cause.message : String(cause),
              }),
        ),
      ),
    createWorktree: ({ repositoryRoot, path, branch }) =>
      runProcess(
        "git",
        ["worktree", "add", "-b", branch, path],
        expandHome(repositoryRoot),
      ).pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.void
            : Effect.fail(
                new WorktreeGitError({
                  message: `git worktree add failed: ${result.output}`,
                }),
              ),
        ),
        Effect.mapError((cause) =>
          cause instanceof WorktreeGitError
            ? cause
            : new WorktreeGitError({
                message: cause instanceof Error ? cause.message : String(cause),
              }),
        ),
      ),
    listWorktrees: ({ root, repositoryRoot }) =>
      runProcess(
        "git",
        ["worktree", "list", "--porcelain"],
        expandHome(repositoryRoot ?? root),
      ).pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.succeed(result)
            : Effect.fail(
                new WorktreeGitError({
                  message: `git worktree list failed: ${result.output}`,
                }),
              ),
        ),
        Effect.map((result) => {
          const normalizedRoot = expandHome(root).replace(/\/$/u, "");
          const records: WorktreeRecord[] = [];
          for (const block of result.output.split(/\n\n/u)) {
            const path = block.match(/^worktree (.+)$/mu)?.[1];
            if (
              path !== undefined &&
              (normalizedRoot === "/" ||
                path === normalizedRoot ||
                path.startsWith(`${normalizedRoot}/`))
            ) {
              const branch = block.match(/^branch refs\/heads\/(.+)$/mu)?.[1];
              records.push(branch === undefined ? { path } : { path, branch });
            }
          }
          return records;
        }),
        Effect.mapError((cause) =>
          cause instanceof WorktreeGitError
            ? cause
            : new WorktreeGitError({
                message: cause instanceof Error ? cause.message : String(cause),
              }),
        ),
      ),
    removeWorktree: ({ path, repositoryRoot }) =>
      runProcess(
        "git",
        ["worktree", "remove", "--force", path],
        expandHome(repositoryRoot ?? path),
      ).pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.void
            : Effect.fail(
                new WorktreeGitError({
                  message: `git worktree remove failed: ${result.output}`,
                }),
              ),
        ),
        Effect.mapError((cause) =>
          cause instanceof WorktreeGitError
            ? cause
            : new WorktreeGitError({
                message: cause instanceof Error ? cause.message : String(cause),
              }),
        ),
      ),
  }),
  Layer.succeed(WorktreePortlessService, {
    register: ({ name, url, worktreePath }) =>
      runProcess(
        "portless",
        ["add", name, url, worktreePath],
        expandHome(worktreePath),
      ).pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.void
            : Effect.fail(
                new WorktreeCommandError({
                  message: `Portless registration failed: ${result.output}`,
                }),
              ),
        ),
      ),
  }),
  Layer.succeed(WorktreeMutationService, {
    run: ({ operation }) => operation,
  }),
);
