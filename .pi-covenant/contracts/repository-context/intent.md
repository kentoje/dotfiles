# repository-context: behavior contract

Status: specified design; all obligations draft. Kind: shared-component. Implementation and executable acceptance checks are pending.

## Purpose

Resolve explicit project/repository/worktree identity and project-owned operating facts consistently for every tool.

Tools must agree on the selected context while tailored project CLIs remain project-specific.

## Ownership

- Context precedence, canonical paths, source provenance and optional project capabilities

## Excluded scope

- Running checks or setup during fact lookup
- A universal repository matrix, hard-coded home paths or invented policy defaults

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### REPOSITORYCONTEXT-001

Scope: The relevant component operations and their shared prerequisites.

Must: Repository context must identify the selected repository and worktree rather than rely on a fixed developer-home path.

Why: Tools must agree on the selected context while tailored project CLIs remain project-specific.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### REPOSITORYCONTEXT-002

Scope: The relevant component operations and their shared prerequisites.

Must: Repository context must preserve explicit project choices for available commands, setup, preview and CLI capabilities.

Why: Tools must agree on the selected context while tailored project CLIs remain project-specific.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### REPOSITORYCONTEXT-003

Scope: The relevant component operations and their shared prerequisites.

Must: Unavailable or conflicting repository configuration must be reported explicitly instead of guessed as a verified fact.

Why: Tools must agree on the selected context while tailored project CLIs remain project-specific.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### REPOSITORYCONTEXT-004

Scope: resolution.

Must: Explicit invocation context must override project and host defaults without silently switching the selected repository.

Why: The tool must honor the context the user actually selected.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### REPOSITORYCONTEXT-005

Scope: non-Git directories.

Must: A non-Git project must remain discoverable for project CLI proposals while Git-dependent operations report a missing Git prerequisite.

Why: Standard Pi and CLI creation must work outside Git repositories.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### REPOSITORYCONTEXT-006

Scope: facts.

Must: Repository facts must include their source and unavailable values instead of fabricated command, route, auth or policy defaults.

Why: Unknown metadata is different from an explicitly chosen none policy.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `resolve`

Effect: read-only. Inputs and output data: [definition.json](definition.json).

### Rules

- Resolve cwd against the session path and canonicalize existing roots. Conflicting explicit cwd/repository choices block rather than silently override each other.
- Read only trusted host configuration and selected project declarations/metadata. No home-directory scan, arbitrary script evaluation, fetch or install.
- Resolve per-project configured worktree roots/setup/delivery/title/route/auth/capability facts with provenance. Missing facts stay unavailable; malformed facts are errors.
- For a non-Git project return project identity and available authoring facts, with Git fields null. Git operations consume that as a missing prerequisite.
- Do not independently infer a verification suite when an agreed project CLI exists; its manifest owns selected capabilities.

### Required ordering

apply explicit scope → resolve canonical project/Git identity → read trusted declarations → reconcile explicit facts → return values with provenance

### Failure semantics

- CONTEXT_CONFLICT
- PATH_UNAVAILABLE
- CONFIG_INVALID
- REMOTE_AMBIGUOUS

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**RC-ROOT-01** — Given The same project is moved under another home directory. When Resolve. Then Use the new selected root rather than a hard-coded developer path.

**RC-NONGIT-02** — Given A directory has scripts but no Git repository. When Resolve for project CLI discovery. Then Return usable project facts and null Git fields.

**RC-BAD-03** — Given Project config names a conflicting repository. When Resolve. Then Report conflict with sources; do not guess which target to mutate.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Facts are observations, not permanent truths.
- A project can be a useful non-Git directory for CLI authoring while lacking Git-only capabilities.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/repository-context.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
