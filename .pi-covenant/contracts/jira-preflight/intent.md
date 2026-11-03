# jira-preflight: behavior contract

Status: specified design; all obligations draft. Kind: preflight. Implementation and executable acceptance checks are pending.

## Purpose

Make duplicate issue decisions explicit for the exact selected create proposal, without local ticket-binding state.

The user wants Jira operations; the old documented guard usefully prevented accidental duplicate creation.

## Ownership

- Exact normalized duplicate candidates and proposal-bound confirmation state

## Excluded scope

- Creating an issue, maintaining branch-ticket bindings, universal Jira workflow defaults
- Claiming semantic duplicate detection is complete

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### JIRAPREFLIGHT-001

Scope: The relevant component operations and their shared prerequisites.

Must: Jira duplicate preflight must evaluate the proposed issue in its selected Jira context.

Why: The user wants Jira operations; the old documented guard usefully prevented accidental duplicate creation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRAPREFLIGHT-002

Scope: The relevant component operations and their shared prerequisites.

Must: A potential duplicate Jira creation must wait for the duplicate decision before creating the issue.

Why: The user wants Jira operations; the old documented guard usefully prevented accidental duplicate creation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRAPREFLIGHT-003

Scope: The relevant component operations and their shared prerequisites.

Must: A failed duplicate lookup must be reported as an unresolved preflight rather than proof that no matching issue exists.

Why: The user wants Jira operations; the old documented guard usefully prevented accidental duplicate creation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRAPREFLIGHT-004

Scope: matching.

Must: Duplicate Jira lookup must use a documented normalization rule and distinguish exact matches from heuristic suggestions.

Why: A similarity guess should not masquerade as exact identity.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRAPREFLIGHT-005

Scope: confirmation.

Must: A duplicate confirmation must bind the selected project, summary and presented candidates and expire if that proposal changes.

Why: An earlier duplicate decision cannot authorize a different create request.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `check_creation`

Effect: read-only. Inputs and output data: [definition.json](definition.json).

### Rules

- Search within the exact selected site/project. Compare normalized summaries, including visible closed issues; display state rather than silently treating closed as absent.
- Exact matches require a duplicate decision, not a fabricated automatic reuse or automatic new issue. Heuristic suggestions are labeled separately.
- A valid previously accepted decision for this exact proposal can permit the caller to proceed; the opaque identity is correlation, not an authorization token by itself.
- Unfinished pagination or lookup failure blocks a no-duplicate assertion. No Jira mutation or branch-ticket state file is written by preflight.

### Required ordering

resolve exact proposal → search bounded pages needed for completeness → normalize visible summaries → match or require decision → return proposal identity

### Failure semantics

- LOOKUP_FAILED
- SEARCH_INCOMPLETE
- CONTEXT_AMBIGUOUS

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JP-MATCH-01** — Given Existing CI-123 summary differs only by case/whitespace. When Check creation. Then Return exact match and duplicate_decision_required.

**JP-DENY-02** — Given User declines creation after seeing that match. When Resume create caller. Then No create request is sent.

**JP-CHANGE-03** — Given Project/summary changes after a duplicate decision. When Check again. Then Do not reuse the old decision.

**JP-FAIL-04** — Given Search fails or is incomplete. When Check creation. Then Return blocked, never proceed based on apparent absence.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Search visibility and incomplete pagination limit what can be known.
- Closed issues can still be displayed as duplicate candidates; the user may explicitly choose a new issue.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/jira-preflight.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.

### Internal seam clarification

The earlier check_creation sequence describes the end-to-end Jira caller workflow. Its internal module port is evaluate_duplicates: Jira fetches candidates and passes completeness plus exact proposal fields to this pure policy. Jira-preflight performs no remote search. The architecture module schema is canonical for this internal call.
