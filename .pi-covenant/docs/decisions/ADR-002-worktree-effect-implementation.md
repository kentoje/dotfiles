# Worktree implementation with TypeScript and Effect

Status: implementation authorized by the user. Existing worktree obligation meanings are unchanged.

Use TypeScript with Effect 4.1.2 and the matching Node platform package. The official effect-ts skill is installed locally; installed package guidance is authoritative. The public entrypoint is src/worktree/module-port.ts, exporting makeWorktreeModule. Pure path decisions, Git registration parsing, process lifecycle, setup/creation, readiness and removal are separate files.

The composition root supplies a trusted resolved WorktreeHost. This first module does not pretend to implement repository-context discovery or the entire shared protocol module. Effect Schema validates worktree requests; external result shapes remain the agreed JSON schemas. Invocation deadlines and cancellation are separate host inputs, never agent approval arguments. Effect scopes manage owned process groups and exclusive mutation locks. Dependent operations inherit the caller's deadline.

Root selection is explicit host configuration, PI_WORKTREE_ROOT, then ~/.pi/worktrees. Paths use <root>/<safe repository namespace>/<task>. Project setup is an explicit argv command with mode after-create or creates-worktree. It receives PI_WORKTREE_PATH, PI_WORKTREE_BRANCH, PI_WORKTREE_BASE and PI_WORKTREE_REPOSITORY. There is no implicit script discovery, shell interpolation, package install, environment copying, fetch, reset, clean, MR creation or product verification. Git hooks and filesystem monitor commands are disabled for module-owned Git calls. Ambient Git target overrides are cleared.

Private records in the common Git directory retain setup outcome, comparison basis and removed-target identity. They never authorize removing an unregistered replacement directory. A sibling exclusive lock coordinates mutations across module instances/processes. Locks are not automatically stolen: an abandoned lock produces RESOURCE_BUSY until deliberately inspected. Git branches remain after removal. Removal conservatively treats ignored files as potential user work too; there is no force mode.

Existing external tools do not participate in the module lock. The module checks current state and uses Git's non-forced removal, but this is not an OS sandbox or an atomic transaction against unrelated processes. Setup is trusted executable project code. Cancellation terminates owned process groups, retains user files/checkouts, and reports completed effects. Process shutdown may extend past the caller's deadline while bounded cleanup runs.

The Covenant Vitest companion is packaged from the existing local Covenant integration as vendor/covenant-vitest-0.1.0.tgz, including its license. This avoids an absolute developer-path dependency or a nonexistent registry publication. The lockfile records integrity; runtime credentials are not bundled.

Alternatives rejected: reproducing repository discovery inside worktree (violates ownership); a universal setup/test recipe (violates per-project behavior); detached unowned setup jobs (prevents reliable cancellation); force-removal fallback (risks user work); global-only companion installation (not reproducible).

Verification: exact bindings precede implementation slices. Real temporary Git repositories test lifecycle and safety; controlled fault probes test rejection. Broader module behavior and Pi registration need their own executable checks before activation. No Stryker score is inferred from controlled probes.
