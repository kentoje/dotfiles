# ship: behavior contract

Status: specified design; all obligations draft. Kind: user-command. Implementation and executable acceptance checks are pending.

## Purpose

On an explicit shipping request, commit and push task changes, create/reuse a draft MR, address feedback and reach current-head CI readiness for human review.

The user explicitly selected shipping through review feedback and CI readiness. This is requested work within the current run, not the removed ship-gate hook.

## Ownership

- Task-scoped commit/push/MR delivery
- Current-run review triage, authorized fixes and bounded CI observation
- A precise ready/blocked/partial/cancelled summary

## Excluded scope

- Automatic shipping on ordinary completion
- Implicit merge, deployment, force push or new task branch
- Waking another run when blocked or after the command returns

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### SHIPPING-001

Scope: The relevant component operations and their shared prerequisites.

Must: Completing an ordinary coding task must not require creating or updating a merge request.

Why: The user explicitly selected shipping through review feedback and CI readiness. This is requested work within the current run, not the removed ship-gate hook.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-002

Scope: The relevant component operations and their shared prerequisites.

Must: Shipping actions must occur only within an explicit user request to ship.

Why: The user explicitly selected shipping through review feedback and CI readiness. This is requested work within the current run, not the removed ship-gate hook.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-003

Scope: The relevant component operations and their shared prerequisites.

Must: A blocked completion must report its blocker without automatically enqueuing or triggering another agent turn.

Why: The user explicitly selected shipping through review feedback and CI readiness. This is requested work within the current run, not the removed ship-gate hook.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-004

Scope: run.

Must: An explicit ship command must operate on the selected task branch and reuse an existing branch MR instead of creating a duplicate.

Why: Shipping should continue the requested task rather than fork another delivery.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-005

Scope: commit.

Must: Shipping must commit only task-authorized changes and must not stage unrelated user edits implicitly.

Why: A repository may contain concurrent work belonging to the user.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-006

Scope: push and boundaries.

Must: Shipping must push normally and must not force-push, merge or deploy by default.

Why: Shipping to review is not production release authority.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-007

Scope: review and CI.

Must: Shipping must drive review feedback and required CI readiness for the latest pushed head within the current user-requested run.

Why: The user explicitly selected readiness rather than stopping after MR creation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-008

Scope: freshness.

Must: Shipping must not claim readiness from a pipeline or review observation belonging to an earlier head.

Why: Fixes and rebases invalidate earlier readiness observations.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-009

Scope: liveness.

Must: Shipping must bound polling and repair rounds and return unresolved blockers without scheduling a new agent turn.

Why: The user rejected automatic blocked-completion follow-ups.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-010

Scope: completion.

Must: Shipping must mark an MR ready for human review only after the selected project checks, required CI and addressed blocking feedback satisfy the readiness policy.

Why: An MR existing is not equivalent to ready for human review.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### SHIPPING-011

Scope: feedback.

Must: Shipping must preserve rejected or unresolved review findings with an explicit rationale rather than resolving every discussion indiscriminately.

Why: Human review intent must remain visible.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `run`

Effect: remote-write. Inputs and output data: [definition.json](../../commands/ship/definition.json).

### Rules

- Only an explicit /ship or equivalent user shipping request enters this workflow. Narrower existing instructions still constrain commits, branches, paths and remote actions.
- Resolve the current task branch/worktree and target branch. Default/detached branches, mixed ownership of changes or an unknown base require an actionable decision; do not silently make another branch.
- Inspect task diff and run the agreed relevant project CLI capabilities/checks. Unrelated preexisting changes are not staged or committed. Missing project CLI can be reported or use an already agreed repository command; creation remains a separate proposal/request.
- Apply only configured delivery/title requirements. Commit only authorized task paths, push normally, and reuse exactly one existing branch MR or create one draft MR after preflight. Never force-push automatically.
- Read complete relevant review and current-head CI state. Evaluate feedback, repair within task scope, reply with concrete reasoning, and resolve only addressed or explicitly justified discussions. Human decisions, unavailable entitlements, product-scope ambiguity or approval requirements remain blockers.
- For eligible CI failures, diagnose first; use explicitly authorized retry for a transient failure, not blind endless retries. Manual deployment jobs are not played as part of shipping.
- After each repair/push, update head identity and invalidate prior readiness observations. At most the configured repair rounds occur within the original deadline. Waiting is owned by this invocation and stops on cancellation or expiry.
- Ready requires relevant agreed local checks, required current-head CI checks, and no unaddressed blocking feedback under configured policy. Skipped/allowed-failure/manual states follow explicit project policy; unknown required state is not success.
- Remove draft only when ready for human review and requested shipping scope permits. Never merge/deploy by default. On blocker/deadline/cancellation return exact completed effects and next steps, with no scheduled follow-up turn.

### Required ordering

resolve scope/branch and inspect changes → run agreed relevant checks → validate delivery requirements → commit task changes → push current task branch → find/create or update draft MR → read review and current-head CI → diagnose/repair/recheck/push within bounded rounds → refresh all readiness on final head → mark ready or return blockers

### Failure semantics

- TASK_SCOPE_AMBIGUOUS
- DEFAULT_OR_DETACHED_BRANCH
- LOCAL_CHECK_FAILED
- DELIVERY_REQUIREMENT_FAILED
- DUPLICATE_MR
- PUSH_FAILED
- REVIEW_DECISION_REQUIRED
- CI_UNAVAILABLE
- DEADLINE_EXCEEDED
- REPAIR_LIMIT
- CANCELLED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**SH-READY-01** — Given Task branch has authorized changes and no MR; project checks pass. When Invoke /ship. Then Commit task changes, push, create one draft MR, address review, wait for required CI on the final head and mark ready; do not merge.

**SH-REUSE-02** — Given The branch already has MR !42. When Invoke /ship. Then Update !42; do not create !43 merely because more commits were added.

**SH-HEAD-03** — Given CI is green for A; a review fix pushes B. When Continue shipping. Then Invalidate A readiness and require observations for B.

**SH-BLOCK-04** — Given A required human decision or the deadline blocks progress. When Ship. Then Return blockers and completed effects; no automatic new agent turn.

**SH-OWNERSHIP-05** — Given A tracked file contains unrelated user changes. When Ship without clear staging scope. Then Do not stage those changes implicitly; request the necessary scope decision.

**SH-CANCEL-06** — Given A commit and push completed before cancellation while waiting for CI. When Cancel command. Then Return those completed IDs, stop local waiting and leave remote CI running unless separately asked to cancel it.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- A green pipeline can become outdated when a new head is pushed.
- A human approval or inaccessible CI prerequisite can require the operator; do not manufacture it.
- Remote CI may continue after local cancellation; canceling it is a separate explicitly targeted request.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/shipping.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
