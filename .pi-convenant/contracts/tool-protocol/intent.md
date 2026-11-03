# tool-protocol: behavior contract

Status: specified design; all obligations draft. Kind: development-contract. Implementation and executable acceptance checks are pending.

## Purpose

Provide consistent target resolution, bounded execution and truthful effects across all tools.

Keep development discipline separate from product behavior.

## Ownership

- The native obligations below

## Excluded scope

- Product runtime gates and replacement agent runtimes

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### TOOLPROTOCOL-001

Scope: all actions.

Must: Validate the complete action input and resolve its target before any external mutation.

Why: Preflight errors must not leave unintended partial work.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-002

Scope: all results.

Must: Every result must preserve the resolved repository or project identity and explicit operation target.

Why: Numeric remote IDs alone are ambiguous across projects.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-003

Scope: mutating actions.

Must: Existing task authorization must determine allowed mutations; a model-supplied approval boolean must not grant authority.

Why: Authorization belongs to the user request, not the tool argument payload.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-004

Scope: remote writes.

Must: A remote write with an unknown commit outcome must report indeterminate state and must not be automatically repeated.

Why: A timeout can occur after a comment or issue was already created.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-005

Scope: transport handling.

Must: Read retries must be bounded by the call deadline and mutations must not receive an automatic generic retry.

Why: Transient recovery must not create duplicate external effects or endless calls.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-006

Scope: cancellation.

Must: Cancellation must stop scheduling new work and report already completed effects without claiming rollback.

Why: Stopping a client does not undo an acknowledged remote write.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-007

Scope: collection actions.

Must: Collection responses must expose pagination or truncation rather than claiming an incomplete list is complete.

Why: Incomplete review or job lists must remain visibly incomplete.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-008

Scope: output.

Must: Output and diagnostics must be bounded and redact known credentials without claiming exhaustive secret detection.

Why: Job logs and transport diagnostics are large and may contain credentials.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-009

Scope: result delivery.

Must: A failed or blocked tool result must not schedule a new agent turn automatically.

Why: The user explicitly rejected blocked-completion auto-continuation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### TOOLPROTOCOL-010

Scope: mutation coordination.

Must: Concurrent conflicting writes to the same resource must be serialized or rejected before a second mutation starts.

Why: Pi can issue concurrent calls; unrelated resources should remain independent.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- No executable implementation or passing evidence exists yet.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/tool-protocol.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
