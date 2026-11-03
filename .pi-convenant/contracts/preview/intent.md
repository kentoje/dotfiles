# preview: behavior contract

Status: specified design; all obligations draft. Kind: project-cli-capability. Implementation and executable acceptance checks are pending.

## Purpose

Offer preview lookup/startup only in a project CLI whose agreed capabilities include them.

The user chose project CLI capabilities for preview and Storybook instead of dedicated global tools.

## Ownership

- Configured development URL, startup mode, instance identity/readiness and ownership

## Excluded scope

- Universal harness tool registration
- Implicit browser login or adopting/stopping an unrelated server

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### PREVIEW-001

Scope: The relevant component operations and their shared prerequisites.

Must: Preview lookup must report the URL and runtime state of the selected project or worktree.

Why: The user chose project CLI capabilities for preview and Storybook instead of dedicated global tools.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PREVIEW-002

Scope: The relevant component operations and their shared prerequisites.

Must: Preview startup must use the project-selected startup capability or command and must not duplicate an already running instance.

Why: The user chose project CLI capabilities for preview and Storybook instead of dedicated global tools.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PREVIEW-003

Scope: The relevant component operations and their shared prerequisites.

Must: Preview results must report known authentication requirements without silently attempting browser login.

Why: The user chose project CLI capabilities for preview and Storybook instead of dedicated global tools.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PREVIEW-004

Scope: placement.

Must: Preview is an optional tailored project CLI capability and must not be registered as a universal harness tool.

Why: The user explicitly chose per-project capabilities.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PREVIEW-005

Scope: up, url.

Must: Preview readiness must check the selected app identity and usable readiness signal, not merely an occupied port.

Why: Another process answering on the same port is not the requested app.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PREVIEW-006

Scope: ownership.

Must: Preview cleanup must stop only processes owned by the invocation or explicitly adopted for cleanup.

Why: An already running user preview must survive an unrelated run cleanup.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `url`

Effect: read-only. Inputs and output data: [definition.json](../../capabilities/preview/definition.json).

### Rules

- Use the invoking project CLI context and configured route. No startup or login occurs.
- Report running separately from ready and include known instance/build identity in context. Unknown auth is unknown, not none.

### Required ordering

resolve configured capability/mode → inspect route and readiness if configured → return observed state

### Failure semantics

- CAPABILITY_NOT_SELECTED
- MODE_UNSUPPORTED
- ROUTE_UNAVAILABLE

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PV-URL-01** — Given Configured route is registered but no app is usable. When Read preview URL. Then Return the route with ready=false and its cause, not a ready server.

**PV-URL-02** — Given Another worktree owns a different route. When Read current project URL. Then Never substitute the other worktree route.

## Action `up`

Effect: process. Inputs and output data: [definition.json](../../capabilities/preview/definition.json).

### Rules

- Validate selected mode and exact project-owned startup command. Reuse an already ready matching instance with ownership=borrowed.
- If startup is needed, track its PID/process group and unique instance token, wait only to the configured bounded usable-readiness signal, and verify project/build identity.
- Report browser-login as a prerequisite rather than silently navigating. On timeout/cancellation clean up only newly owned startup resources and preserve captured evidence.
- Long-lived owned servers remain registered for explicit project CLI cleanup/session cleanup policy; borrowed servers survive cleanup.

### Required ordering

resolve mode and ownership → check existing app identity → start when absent → wait for usable readiness → report or clean failed owned startup

### Failure semantics

- CAPABILITY_NOT_SELECTED
- MODE_UNSUPPORTED
- INSTANCE_MISMATCH
- START_FAILED
- READY_TIMEOUT
- CANCELLED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PV-UP-01** — Given A matching ready preview already runs. When Start again. Then Reuse it; no second process and no takeover of ownership.

**PV-UP-02** — Given A wrong app answers on the configured port. When Start preview. Then Report mismatch rather than ready or killing that process.

**PV-UP-03** — Given New startup never reaches usable readiness. When Start. Then Return timeout, stop owned process and retain diagnostics.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- A TCP listener is not proof of the right app or build.
- Exact startup modes and readiness probes belong to the project capability definition.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/preview.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
