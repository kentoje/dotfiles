# mr-guard: behavior contract

Status: specified design; all obligations draft. Kind: preflight. Implementation and executable acceptance checks are pending.

## Purpose

Protect explicitly requested MR creation from duplicate or mis-targeted mutations and apply only configured repository delivery requirements.

Duplicate protection remains useful at creation time, but must not recreate the removed automatic ship gate.

## Ownership

- Ship-native MR creation preflight
- A declared set of direct glab MR-creation entrypoints when interception is enabled

## Excluded scope

- Ordinary completion gating
- Guarantees about every arbitrary shell/network program
- Creating, pushing or merging the MR itself

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### MRGUARD-001

Scope: The relevant component operations and their shared prerequisites.

Must: An MR creation guard must check the effective target repository and source branch of the requested creation.

Why: Duplicate protection remains useful at creation time, but must not recreate the removed automatic ship gate.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MRGUARD-002

Scope: The relevant component operations and their shared prerequisites.

Must: An MR creation guard must surface an already existing matching MR before another MR is created.

Why: Duplicate protection remains useful at creation time, but must not recreate the removed automatic ship gate.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MRGUARD-003

Scope: The relevant component operations and their shared prerequisites.

Must: An MR creation guard must not require an MR at ordinary task completion or enqueue an automatic continuation when creation is blocked.

Why: Duplicate protection remains useful at creation time, but must not recreate the removed automatic ship gate.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MRGUARD-004

Scope: preflight.

Must: MR creation protection must distinguish zero, one and multiple existing branch MRs and treat lookup failure as unresolved protection.

Why: Lookup failure or ambiguity is not permission to create another MR.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MRGUARD-005

Scope: policy.

Must: Repository-specific title and delivery checks must be enforced only when explicitly configured for the selected repository.

Why: One project release workflow must not be imposed on every project.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MRGUARD-006

Scope: coverage.

Must: The guard must declare which direct creation entrypoints it covers and must not claim to sandbox arbitrary shell programs.

Why: A command interceptor is not a general remote-mutation firewall.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `check_creation`

Effect: read-only. Inputs and output data: [definition.json](definition.json).

### Rules

- Resolve the effective creation cwd/source/target, including supported direct-command leading cwd changes. Unparseable recognized creation syntax blocks with guidance instead of checking the wrong cwd.
- Lookup all open matching branch MRs completely. Zero may proceed; one returns reuse_existing; more than one blocks ambiguity. Lookup failure blocks the creation, not the rest of the coding session.
- Apply only explicitly configured title/release-artifact rules using branch evidence. No configured rule means no invented one.
- No creation occurs here. A blocked result produces one report and no follow-up agent turn.

### Required ordering

resolve creation context → lookup existing MRs completely → inspect configured requirements → return allow/reuse/block

### Failure semantics

- CREATION_CONTEXT_UNKNOWN
- LOOKUP_FAILED
- DUPLICATE_OR_AMBIGUOUS_MR
- TITLE_POLICY_FAILED
- DELIVERY_REQUIREMENT_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**MG-ONE-01** — Given Branch already has one open MR. When Preflight creation. Then Return reuse_existing with its IID; no second creation.

**MG-CWD-02** — Given A supported direct command selects another cwd. When Preflight. Then Use that repository, not session cwd.

**MG-LOOKUP-03** — Given GitLab lookup fails. When Preflight. Then Block the creation without claiming no MR and without starting another turn.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- An interceptor is not an OS sandbox and cannot identify every aliased/scripted remote write.
- Final server-side uniqueness can race another creator; re-query and report a conflict instead of creating repeatedly.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/mr-guard.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
