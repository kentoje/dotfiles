import { mkdir, lstat } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";

import { inspectWorktreeRecord } from "../inspection/inspect.js";
import { worktreeFailure } from "../model.js";
import type {
  WorktreeEffectRecord,
  WorktreeRecord,
  WorktreeHost,
  WorktreeNewRequest,
  WorktreeProgress,
} from "../model.js";
import {
  canonicalWorktreePath,
  isWithinWorktreeRoot,
  resolveWorktreeRoot,
  worktreeFilesystem,
} from "../paths/resolve.js";
import { runWorktreeProcess, runWorktreeGit } from "../process/run.js";
import { readWorktreeRegistry } from "../registration/read.js";
import { saveWorktreeState } from "../state/store.js";

/** Resolve explicit branch and locally available base without fetching or rewriting refs. */
const resolveWorktreeCreationBase = Effect.fn("resolveWorktreeCreationBase")(
  function* resolveWorktreeCreationBase(
    host: WorktreeHost,
    request: WorktreeNewRequest,
    branch: string
  ) {
    if (
      (yield* runWorktreeGit(host.repositoryPath, [
        "check-ref-format",
        "--branch",
        branch,
      ]).pipe(
        Effect.mapError(() =>
          worktreeFailure(
            "BRANCH_CONFLICT",
            "Requested branch name is invalid."
          )
        )
      )) !== branch
    ) {
      return yield* worktreeFailure(
        "BRANCH_CONFLICT",
        "Branch shorthand is not an explicit branch name."
      );
    }
    const branches = yield* runWorktreeGit(host.repositoryPath, [
      "for-each-ref",
      "--format=%(refname)",
      `refs/heads/${branch}`,
    ]);
    if (branches.split("\n").includes(`refs/heads/${branch}`)) {
      return yield* worktreeFailure(
        "BRANCH_CONFLICT",
        "Task branch already exists without this matching worktree."
      );
    }
    const remoteDefault = yield* runWorktreeGit(host.repositoryPath, [
      "symbolic-ref",
      "--quiet",
      "refs/remotes/origin/HEAD",
    ]).pipe(Effect.catch(() => Effect.succeed("")));
    const base =
      request.base ?? host.defaultBase ?? (remoteDefault || undefined);
    if (!base || base.startsWith("-")) {
      return yield* worktreeFailure(
        "BASE_UNAVAILABLE",
        "An existing local base is required."
      );
    }
    yield* runWorktreeGit(host.repositoryPath, [
      "rev-parse",
      "--verify",
      "--end-of-options",
      `${base}^{commit}`,
    ]).pipe(
      Effect.mapError(() =>
        worktreeFailure(
          "BASE_UNAVAILABLE",
          "The requested base is not locally available."
        )
      )
    );
    return base;
  }
);

/** Repository-owned setup either creates the checkout or runs after native creation, never both. */
export const createManagedWorktree = Effect.fn("createManagedWorktree")(
  function* createManagedWorktree(
    host: WorktreeHost,
    request: WorktreeNewRequest,
    progress: WorktreeProgress
  ) {
    const root = yield* resolveWorktreeRoot(host);
    const path = join(root, request.task);
    const canonical = yield* worktreeFilesystem(() =>
      canonicalWorktreePath(path)
    );
    if (!isWithinWorktreeRoot(root, canonical) || canonical !== path) {
      return yield* worktreeFailure(
        "UNSAFE_PATH",
        "Worktree destination escapes its root or uses a symlink."
      );
    }
    const present = yield* worktreeFilesystem(() =>
      lstat(path).then(
        () => true,
        (error) => {
          if (error.code === "ENOENT") {
            return false;
          }
          throw error;
        }
      )
    );
    const branch = request.branch ?? request.task;
    const registry = yield* readWorktreeRegistry(host.repositoryPath);
    const existing = registry.find((record) => record.path === path);
    if (existing) {
      if (existing.branch !== branch || !present || existing.primary) {
        return yield* worktreeFailure(
          "PATH_CONFLICT",
          "Registered task identity conflicts with the requested checkout."
        );
      }
      return (yield* inspectWorktreeRecord(host, existing)).worktree;
    }
    if (present) {
      return yield* worktreeFailure(
        "PATH_CONFLICT",
        "Worktree path already exists."
      );
    }
    const base = yield* resolveWorktreeCreationBase(host, request, branch);
    yield* worktreeFilesystem(() => mkdir(root, { recursive: true }));
    const retainCreated = Effect.fn("retainCreatedWorktree")(
      function* retainCreated() {
        const record = (yield* readWorktreeRegistry(host.repositoryPath)).find(
          (entry) => entry.path === path && entry.branch === branch
        );
        if (!record) {
          const refs = yield* runWorktreeGit(host.repositoryPath, [
            "for-each-ref",
            "--format=%(refname)",
            `refs/heads/${branch}`,
          ]);
          const branchCreated = refs
            .split("\n")
            .includes(`refs/heads/${branch}`);
          progress.effects = progress.effects.filter(
            (effect) => effect.phase !== "create"
          );
          if (branchCreated) {
            progress.effects.push({
              outcome: "committed",
              phase: "create",
              reference: branch,
              target: `refs/heads/${branch}`,
            });
          }
          return false;
        }
        progress.record = {
          branch,
          head_sha: record.head_sha,
          path,
          readiness:
            host.setup.kind === "none" ? "not_configured" : "setup_failed",
          setup_completed: false,
        };
        progress.effects = progress.effects.filter(
          (effect) => effect.phase !== "create"
        );
        progress.effects.push({
          outcome: "committed",
          phase: "create",
          reference: branch,
          target: path,
        });
        yield* saveWorktreeState(host.repositoryPath, {
          base,
          branch,
          path,
          removed: false,
          setup: host.setup.kind === "none" ? "none" : "failed",
        });
        return true;
      }
    );
    const setup = Effect.fn("runRepositoryWorktreeSetup")(function* setup() {
      if (host.setup.kind === "none") {
        return;
      }
      progress.phase = "setup";
      const setupEffect = {
        outcome: "unknown",
        phase: "setup",
        reference: host.setup.command,
        target: path,
      } satisfies WorktreeEffectRecord;
      progress.effects.push(setupEffect);
      const result = yield* runWorktreeProcess(
        host.setup.command,
        host.setup.args,
        host.setup.kind === "creates-worktree" ? host.repositoryPath : path,
        {
          PI_WORKTREE_BASE: base,
          PI_WORKTREE_BRANCH: branch,
          PI_WORKTREE_PATH: path,
          PI_WORKTREE_REPOSITORY: host.repositoryPath,
        }
      ).pipe(
        Effect.mapError(() =>
          worktreeFailure(
            "SETUP_FAILED",
            "Repository setup could not launch or clean up its owned process."
          )
        )
      );
      if (result.code === 0) {
        progress.effects = progress.effects.map((effect) =>
          effect === setupEffect ? { ...effect, outcome: "committed" } : effect
        );
      }
      if (result.truncated) {
        progress.warnings.push(
          "Repository setup output exceeded the capture window."
        );
      }
      if (result.code !== 0) {
        return yield* worktreeFailure(
          "SETUP_FAILED",
          "Repository setup failed; any created checkout is retained."
        );
      }
    });
    if (host.setup.kind === "creates-worktree") {
      yield* setup().pipe(
        Effect.onExit(() =>
          retainCreated().pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                progress.warnings.push(
                  "Creation readback or private state recording failed; inspect the target before retrying."
                );
              })
            )
          )
        )
      );
      if (!progress.record) {
        return yield* worktreeFailure(
          "SETUP_FAILED",
          "Repository setup did not create the requested registered checkout."
        );
      }
    } else {
      progress.phase = "create";
      progress.effects.push({
        outcome: "unknown",
        phase: "create",
        reference: branch,
        target: path,
      });
      yield* runWorktreeGit(host.repositoryPath, [
        "worktree",
        "add",
        "-b",
        branch,
        path,
        base,
      ]).pipe(
        Effect.onExit(() =>
          retainCreated().pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                progress.warnings.push(
                  "Creation readback or private state recording failed; inspect the target before retrying."
                );
              })
            )
          )
        )
      );
      yield* setup();
    }
    const record = (yield* readWorktreeRegistry(host.repositoryPath)).find(
      (entry) => entry.path === path && entry.branch === branch
    );
    if (!record) {
      return yield* worktreeFailure(
        "SETUP_FAILED",
        "Created worktree identity changed during setup."
      );
    }
    const inspected = yield* inspectWorktreeRecord(host, record);
    if (inspected.checks.some((check) => check.state !== "ready")) {
      return yield* worktreeFailure(
        "SETUP_FAILED",
        "Repository setup completed but declared artifacts are missing."
      );
    }
    yield* saveWorktreeState(host.repositoryPath, {
      base,
      branch,
      path,
      removed: false,
      setup: host.setup.kind === "none" ? "none" : "completed",
    });
    const completed = {
      ...inspected.worktree,
      readiness:
        host.setup.kind === "none" ? inspected.worktree.readiness : "ready",
      setup_completed: host.setup.kind !== "none",
    } satisfies WorktreeRecord;
    progress.record = completed;
    return completed;
  }
);
