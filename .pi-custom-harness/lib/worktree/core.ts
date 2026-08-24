import { homedir } from "node:os";
import { Context, Effect, Schema } from "effect";

import { RepoMapService } from "../repo-map/core";

/** A worktree entry returned by Git, including the path and available branch. */
export interface WorktreeRecord {
  readonly path: string;
  readonly branch?: string;
}

/** A completed command used for setup scripts and portless registration. */
export interface WorktreeCommandResult {
  readonly exitCode: number;
  readonly output: string;
}

/** A repository lookup failed before a worktree operation could be trusted. */
export class WorktreeRepositoryFactsError extends Schema.TaggedError<WorktreeRepositoryFactsError>()(
  "WorktreeRepositoryFactsError",
  { message: Schema.String },
) {}

/** Git could not create, list, identify, or remove a worktree. */
export class WorktreeGitError extends Schema.TaggedError<WorktreeGitError>()(
  "WorktreeGitError",
  { message: Schema.String },
) {}

/** A repository setup or portless command failed. */
export class WorktreeCommandError extends Schema.TaggedError<WorktreeCommandError>()(
  "WorktreeCommandError",
  { message: Schema.String },
) {}

/** The worktree filesystem could not answer or apply a required operation. */
export class WorktreeFilesystemError extends Schema.TaggedError<WorktreeFilesystemError>()(
  "WorktreeFilesystemError",
  { message: Schema.String },
) {}

/** The requested task is not a safe worktree name or escapes its configured root. */
export class WorktreePathError extends Schema.TaggedError<WorktreePathError>()(
  "WorktreePathError",
  { message: Schema.String },
) {}

/** File-mutation queue execution failed at the Pi boundary. */
export class WorktreeMutationError extends Schema.TaggedError<WorktreeMutationError>()(
  "WorktreeMutationError",
  { message: Schema.String },
) {}

/** The filesystem seam used by deterministic worktree policy tests. */
export class WorktreeFileSystemService extends Context.Service<
  WorktreeFileSystemService,
  {
    readonly exists: (input: {
      readonly path: string;
    }) => Effect.Effect<boolean, WorktreeFilesystemError>;
  }
>()("pi-custom-harness/lib/worktree/WorktreeFileSystemService") {}

/** The Git seam used to create and safely remove recognized worktrees. */
export class WorktreeGitService extends Context.Service<
  WorktreeGitService,
  {
    readonly resolveRepositoryRoot: (input: {
      readonly cwd: string;
    }) => Effect.Effect<string, WorktreeGitError>;
    readonly createWorktree: (input: {
      readonly repositoryRoot: string;
      readonly path: string;
      readonly branch: string;
    }) => Effect.Effect<void, WorktreeGitError>;
    readonly listWorktrees: (input: {
      readonly root: string;
      readonly repositoryRoot?: string;
    }) => Effect.Effect<ReadonlyArray<WorktreeRecord>, WorktreeGitError>;
    readonly removeWorktree: (input: {
      readonly path: string;
      readonly repositoryRoot?: string;
    }) => Effect.Effect<void, WorktreeGitError>;
  }
>()("pi-custom-harness/lib/worktree/WorktreeGitService") {}

/** The command seam used for repository setup scripts. */
export class WorktreeCommandService extends Context.Service<
  WorktreeCommandService,
  {
    readonly run: (input: {
      readonly program: string;
      readonly arguments_: ReadonlyArray<string>;
      readonly cwd: string;
    }) => Effect.Effect<WorktreeCommandResult, WorktreeCommandError>;
  }
>()("pi-custom-harness/lib/worktree/WorktreeCommandService") {}

/** The typed seam for registering a worktree route with portless. */
export class WorktreePortlessService extends Context.Service<
  WorktreePortlessService,
  {
    readonly register: (input: {
      readonly name: string;
      readonly url: string;
      readonly worktreePath: string;
    }) => Effect.Effect<void, WorktreeCommandError>;
  }
>()("pi-custom-harness/lib/worktree/WorktreePortlessService") {}

/** The Pi-boundary seam that serializes absolute-path mutations. */
export class WorktreeMutationService extends Context.Service<
  WorktreeMutationService,
  {
    readonly run: <Value>(input: {
      readonly path: string;
      readonly operation: Effect.Effect<Value, WorktreeToolError>;
    }) => Effect.Effect<Value, WorktreeToolError>;
  }
>()("pi-custom-harness/lib/worktree/WorktreeMutationService") {}

/** A successful worktree readiness summary; repository checks are never run here. */
export interface WorktreeVerificationSummary {
  readonly passed: true;
  readonly checks: ReadonlyArray<never>;
}

export type WorktreeToolError =
  | WorktreeRepositoryFactsError
  | WorktreeGitError
  | WorktreeCommandError
  | WorktreeFilesystemError
  | WorktreePathError
  | WorktreeMutationError;

/** Input passed to the Pi-free worktree policy. */
export type WorktreeToolInput =
  | { readonly action: "new"; readonly task: string; readonly cwd: string }
  | { readonly action: "verify"; readonly cwd: string }
  | { readonly action: "list"; readonly cwd: string }
  | { readonly action: "rm"; readonly task: string; readonly cwd: string };

/** Worktree details returned by the four actions. */
export type WorktreeToolResult =
  | {
      readonly action: "new";
      readonly task: string;
      readonly path: string;
      readonly url: string;
      readonly verification: WorktreeVerificationSummary;
    }
  | {
      readonly action: "verify";
      readonly path: string;
      readonly verification: WorktreeVerificationSummary;
    }
  | {
      readonly action: "list";
      readonly root: string;
      readonly worktrees: ReadonlyArray<WorktreeRecord>;
    }
  | { readonly action: "rm"; readonly task: string; readonly path: string };

const isSafeTaskName = (task: string | undefined): task is string =>
  task !== undefined &&
  task.length > 0 &&
  task !== "." &&
  task !== ".." &&
  !/[\\/]/u.test(task);

const absolutePath = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

const isWithinRoot = (root: string, target: string): boolean => {
  const normalizedRoot =
    root.length > 1 && root.endsWith("/") ? root.slice(0, -1) : root;
  return normalizedRoot === "/"
    ? target.startsWith("/")
    : target === normalizedRoot || target.startsWith(`${normalizedRoot}/`);
};

const configuredRoot = (root: string) => {
  const expandedRoot =
    root === "~"
      ? homedir()
      : root.startsWith("~/")
        ? `${homedir()}${root.slice(1)}`
        : root;

  return expandedRoot.startsWith("/")
    ? Effect.succeed(
        expandedRoot.length > 1 && expandedRoot.endsWith("/")
          ? expandedRoot.slice(0, -1)
          : expandedRoot,
      )
    : Effect.fail(
        new WorktreePathError({
          message: `Configured worktree root must be absolute: ${root}`,
        }),
      );
};

const taskPath = (
  root: string,
  repositoryRoot: string,
  task: string,
): string => {
  const repositoryName =
    repositoryRoot.split("/").filter(Boolean).at(-1) ?? "repository";
  return `${root.replace(/\/$/u, "")}/${repositoryName}/${task}`;
};

const repositoryFacts = Effect.fn("worktree.repositoryFacts")(function* ({
  cwd,
}: {
  readonly cwd: string;
}) {
  const service = yield* RepoMapService;
  if (service.repositoryFactsFor === undefined) {
    return yield* new WorktreeRepositoryFactsError({
      message: "Worktree repository facts lookup is unavailable.",
    });
  }
  return yield* service.repositoryFactsFor({ cwd });
});

const ensureTask = (task: string | undefined) =>
  isSafeTaskName(task)
    ? Effect.succeed(task)
    : Effect.fail(
        new WorktreePathError({
          message:
            "Worktree task must be a non-empty name without path separators.",
        }),
      );

const worktreeReadiness = (): WorktreeVerificationSummary => ({
  passed: true,
  checks: [],
});

const verifyWorktreeReadiness = ({
  cwd,
  root,
  repositoryRoot,
  expectedBranch,
  fileSystem,
  git,
}: {
  readonly cwd: string;
  readonly root: string;
  readonly repositoryRoot: string;
  readonly expectedBranch?: string;
  readonly fileSystem: WorktreeFileSystemService["Service"];
  readonly git: WorktreeGitService["Service"];
}) =>
  Effect.gen(function* () {
    if (!(yield* fileSystem.exists({ path: cwd }))) {
      return yield* new WorktreeFilesystemError({
        message: `Worktree path does not exist: ${cwd}`,
      });
    }

    const entries = yield* git.listWorktrees({ root, repositoryRoot });
    const entry = entries.find(
      (candidate) => absolutePath(candidate.path) === cwd,
    );
    if (entry === undefined) {
      return yield* new WorktreeGitError({
        message: `Worktree is not recognized: ${cwd}`,
      });
    }
    if (entry.branch === undefined) {
      return yield* new WorktreeGitError({
        message: `Worktree branch is unavailable: ${cwd}`,
      });
    }
    if (expectedBranch !== undefined && entry.branch !== expectedBranch) {
      return yield* new WorktreeGitError({
        message: `Worktree branch does not match requested branch: ${expectedBranch}`,
      });
    }
    return worktreeReadiness();
  });

const verifyWorktree = Effect.fn("worktree.verifyWorktree")(function* ({
  cwd,
}: {
  readonly cwd: string;
}) {
  const facts = yield* repositoryFacts({ cwd });
  const root = yield* configuredRoot(facts.worktreeRoot);
  const git = yield* WorktreeGitService;
  const fileSystem = yield* WorktreeFileSystemService;
  const repositoryRoot = yield* git.resolveRepositoryRoot({ cwd });
  const verification = yield* verifyWorktreeReadiness({
    cwd,
    root,
    repositoryRoot,
    fileSystem,
    git,
  });
  return { action: "verify", path: cwd, verification } as const;
});

/** Executes new, verify, list, and rm with repository facts and safe-root policy. */
export const runWorktreeTool = Effect.fn("runWorktreeTool")(function* (
  input: WorktreeToolInput,
) {
  const { cwd } = input;
  switch (input.action) {
    case "verify":
      return yield* verifyWorktree({ cwd });
    case "list": {
      const facts = yield* repositoryFacts({ cwd });
      const root = yield* configuredRoot(facts.worktreeRoot);
      const git = yield* WorktreeGitService;
      const repositoryRoot = yield* git.resolveRepositoryRoot({ cwd });
      const entries = yield* git.listWorktrees({ root, repositoryRoot });
      return { action: "list", root, worktrees: entries } as const;
    }
    case "new": {
      const safeTask = yield* ensureTask(input.task);
      const facts = yield* repositoryFacts({ cwd });
      const root = yield* configuredRoot(facts.worktreeRoot);
      const git = yield* WorktreeGitService;
      const repositoryRoot = yield* git.resolveRepositoryRoot({ cwd });
      const path = taskPath(root, repositoryRoot, safeTask);
      if (!isWithinRoot(root, path)) {
        return yield* new WorktreePathError({
          message: "Worktree path escapes configured root.",
        });
      }
      const fileSystem = yield* WorktreeFileSystemService;
      if (yield* fileSystem.exists({ path })) {
        return yield* new WorktreePathError({
          message: `Worktree already exists: ${path}`,
        });
      }
      const command = yield* WorktreeCommandService;
      const portless = yield* WorktreePortlessService;
      const fileSystemForReadiness = fileSystem;
      const gitForReadiness = git;
      const mutation = yield* WorktreeMutationService;
      return yield* mutation.run({
        path,
        operation: Effect.gen(function* () {
          yield* git.createWorktree({
            repositoryRoot,
            path,
            branch: safeTask,
          });
          if (facts.setupScript !== undefined) {
            const result = yield* command.run({
              program: "bash",
              arguments_: [`${repositoryRoot}/${facts.setupScript}`, path],
              cwd: repositoryRoot,
            });
            if (result.exitCode !== 0) {
              return yield* new WorktreeCommandError({
                message: `Repository worktree setup failed with exit code ${result.exitCode}.`,
              });
            }
          }
          if (facts.setupScript === undefined) {
            const fallback = yield* command.run({
              program: "git",
              arguments_: ["-C", path, "status", "--short"],
              cwd: repositoryRoot,
            });
            if (fallback.exitCode !== 0) {
              return yield* new WorktreeCommandError({
                message: `Minimal native Git worktree setup failed with exit code ${fallback.exitCode}.`,
              });
            }
          }
          const routeName = `${safeTask}.${facts.portlessRoute.appName}`;
          const url = `${facts.portlessRoute.protocol}://${routeName}${facts.portlessRoute.hostSuffix}`;
          yield* portless.register({
            name: routeName,
            url,
            worktreePath: path,
          });
          const verification = yield* verifyWorktreeReadiness({
            cwd: path,
            root,
            repositoryRoot,
            expectedBranch: safeTask,
            fileSystem: fileSystemForReadiness,
            git: gitForReadiness,
          });
          return {
            action: "new",
            task: safeTask,
            path,
            url,
            verification,
          } as const;
        }),
      });
    }
    case "rm": {
      const safeTask = yield* ensureTask(input.task);
      const facts = yield* repositoryFacts({ cwd });
      const root = yield* configuredRoot(facts.worktreeRoot);
      const git = yield* WorktreeGitService;
      const repositoryRoot = yield* git.resolveRepositoryRoot({ cwd });
      const path = taskPath(root, repositoryRoot, safeTask);
      if (!isWithinRoot(root, path)) {
        return yield* new WorktreePathError({
          message: "Worktree path escapes configured root.",
        });
      }
      const entries = yield* git.listWorktrees({ root, repositoryRoot });
      if (!entries.some((entry) => absolutePath(entry.path) === path)) {
        return yield* new WorktreePathError({
          message: `Worktree is not recognized: ${path}`,
        });
      }
      const mutation = yield* WorktreeMutationService;
      return yield* mutation.run({
        path,
        operation: git
          .removeWorktree({ path, repositoryRoot })
          .pipe(Effect.as({ action: "rm", task: safeTask, path } as const)),
      });
    }
    default: {
      const exhaustive: never = input;
      return exhaustive;
    }
  }
});
