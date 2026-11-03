# worktree: behavior contract

Status: implemented module with active executable acceptance bindings. Kind: tool. Pi registration and real repository discovery are pending.

## Purpose

Create and maintain usable task worktrees without duplicating repository setup logic or losing user work.

The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

## Ownership

- new/verify/list/rm
- Configured root containment, branch/path identity, owned setup work

## Excluded scope

- A universal test suite, MR creation, automatic fetch/reset/clean
- Implicit forced removal or deleting task branches by default

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### WORKTREE-001

Scope: The relevant component operations and their shared prerequisites.

Must: Worktree creation must constrain the new path to the configured worktree root and reject unsafe task paths.

Why: The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-002

Scope: The relevant component operations and their shared prerequisites.

Must: Worktree setup must use the selected repository-owned setup mechanism when one is configured and report setup failures.

Why: The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-003

Scope: The relevant component operations and their shared prerequisites.

Must: Worktree readiness must describe the requested worktree without automatically running a universal repository verification suite.

Why: The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-004

Scope: The relevant component operations and their shared prerequisites.

Must: Worktree listing must distinguish registered task worktrees within the selected configured root.

Why: The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-005

Scope: The relevant component operations and their shared prerequisites.

Must: Worktree removal must refuse unrelated paths and must not discard uncommitted changes through an implicit force operation.

Why: The documented old workflow had recurring setup friction. Worktree setup remains repository-owned; readiness is separate from product verification.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-006

Scope: new.

Must: Worktree creation must return an existing matching registered task worktree without repeating setup, or report an explicit conflict.

Why: Repeated calls should not create duplicate branches or installations.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-007

Scope: new.

Must: A setup failure after worktree creation must retain and identify the created path and branch as partial completion.

Why: The caller needs a recoverable state rather than an invisible failed checkout.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-008

Scope: all actions.

Must: Worktree operations must not fetch, reset, clean or change another checkout implicitly.

Why: Convenient setup must not discard unrelated work.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-009

Scope: rm.

Must: Removal must identify untracked files, uncommitted changes and ahead commits before destructive removal.

Why: A clean index alone is not proof that a task worktree has no unique work.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

### WORKTREE-010

Scope: new, rm.

Must: Worktree cancellation must terminate owned setup work without deleting preexisting or concurrently modified user state.

Why: Cleanup must distinguish resources created by this call from existing work.

Status: active. Record: contract.yaml; exact executable checks: verification.yaml; current execution evidence is reported by Covenant.

## Action `new`

Effect: local-write. Inputs and output data: [definition.json](../../tools/worktree/definition.json).

### Rules

- Resolve root and names; reject absolute paths, path separators, traversal and a destination escaping through a symlink. Validate explicit Git branch names independently.
- Use configured branch naming or task as branch. Resolve base from explicit base, project default, or locally known remote default; unknown base blocks rather than fetches implicitly.
- If the same registered path/task/branch already exists, return it without rerunning setup; conflicting paths/branches block.
- Delegate to the repository-owned setup mechanism and avoid running native creation twice if that mechanism creates the worktree itself. Fallback is native git worktree creation only; absent setup is reported, not fabricated.
- Do not copy environment files from developer home by assumption, install extra packages outside setup scope, start a universal check, or create an MR.
- On setup failure/cancellation after creation, return partial with exact path, branch, completed steps and setup failure; stop owned processes and keep the checkout for recovery.

### Required ordering

resolve context/base/root → validate and lock target → check existing registered worktree → create or delegate → perform configured setup → read readiness → return exact state

### Failure semantics

- UNSAFE_TASK
- PATH_CONFLICT
- BRANCH_CONFLICT
- BASE_UNAVAILABLE
- SETUP_FAILED
- CANCELLED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**WT-NEW-01** — Given Task path contains ../escape. When Create worktree. Then Reject before creating a branch or path.

**WT-NEW-02** — Given Matching task worktree already exists. When Create again. Then Return the same path; no second setup or branch.

**WT-NEW-03** — Given Checkout creation succeeds; setup fails. When Create. Then Return partial with the retained registered checkout and setup_failed.

**WT-NEW-04** — Given Repository setup already creates its worktree. When Create through that mechanism. Then Do not issue an additional native git worktree add.

## Action `verify`

Effect: read-only. Inputs and output data: [definition.json](../../tools/worktree/definition.json).

### Rules

- Inspect the requested registered worktree, branch and declared setup artifacts. Do not read arbitrary developer-home state or run package test/check scripts.
- Readiness is operational worktree setup readiness, not a claim that the app or task is correct. Optional preview/CLI locations may be reported if configured.

### Required ordering

resolve requested worktree → read Git registration and path → inspect declared prerequisites → return readiness checks

### Failure semantics

- UNMANAGED_PATH
- NOT_FOUND
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**WT-VERIFY-01** — Given A worktree exists but a required setup artifact is absent. When Verify it. Then Report the specific missing artifact without starting types/lint/tests.

**WT-VERIFY-02** — Given Another worktree is active in the session. When Verify an explicit path. Then Inspect only the explicit path context.

## Action `list`

Effect: read-only. Inputs and output data: [definition.json](../../tools/worktree/definition.json).

### Rules

- List Git-registered worktrees under the resolved configured task root. Include locked/prunable observations in warnings rather than treating arbitrary directories as managed.
- Do not discover unrelated repositories by scanning the entire home directory.

### Required ordering

resolve repository/root → read Git worktree records → filter contained records → return deterministic path ordering

### Failure semantics

- CONTEXT_UNAVAILABLE
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**WT-LIST-01** — Given Registered worktrees exist inside and outside the root. When List. Then Return only contained managed task worktrees.

**WT-LIST-02** — Given An unregistered folder exists in the root. When List. Then Do not label it a managed Git worktree.

## Action `rm`

Effect: local-write. Inputs and output data: [definition.json](../../tools/worktree/definition.json).

### Rules

- Resolve canonical path, root containment and Git registration before deletion. Refuse the primary checkout, the session current worktree, locked entries or unrelated paths.
- Read tracked/untracked changes and commits ahead of the declared base/tracking ref. Refuse dirty, uniquely ahead or unknown comparison state; v1 has no force action.
- Use Git worktree removal, not recursive deletion of arbitrary directories. Stop only harness-owned resources associated with that path after eligibility is established.
- Keep the task branch by default. Repeated removal of an already absent, previously identified target returns removed=false; it must not delete a replacement unrelated directory.

### Required ordering

resolve/lock requested path → validate registration and safety → inspect work and ahead state → stop owned resources if eligible → remove through Git → report final state

### Failure semantics

- UNSAFE_PATH
- CURRENT_WORKTREE
- DIRTY_WORKTREE
- AHEAD_COMMITS
- LOCKED_WORKTREE
- STATE_UNKNOWN
- REMOVE_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**WT-RM-01** — Given A worktree has untracked source. When Remove. Then Refuse; preserve the file and checkout.

**WT-RM-02** — Given A clean worktree has an unpushed commit. When Remove. Then Refuse and report the unique work.

**WT-RM-03** — Given A registered clean task checkout has no unique commits. When Remove. Then Remove it through Git and retain its branch.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Repository setup is trusted executable code, not a sandbox.
- A cleanup failure can leave an identified recoverable partial state.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/worktree.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
