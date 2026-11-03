# project_cli: behavior contract

Status: specified design; all obligations draft. Kind: tool. Implementation and executable acceptance checks are pending.

## Purpose

Discover, propose, create and maintain a repository-owned CLI whose capabilities match that project and its accepted scope.

The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

## Ownership

- Static discovery and capability proposals
- CLI-owned manifest, entrypoint, helpers, instructions and feature map
- Proof of command/evidence/cleanup behavior and drift repair

## Excluded scope

- A universal types/lint/test/E2E suite or universal browser tooling
- Product-code repairs during maintenance
- Automatic installation into every project, capability expansion or shipping

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### PROJECTCLI-001

Scope: The relevant component operations and their shared prerequisites.

Must: The agent may inspect a project and propose creating a tailored CLI when no suitable project CLI exists.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-002

Scope: The relevant component operations and their shared prerequisites.

Must: An unsolicited project CLI proposal must not create or modify project CLI files before the user accepts it.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-003

Scope: The relevant component operations and their shared prerequisites.

Must: CLI creation must resolve its capability set from the specific project and the agreed user choices.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-004

Scope: The relevant component operations and their shared prerequisites.

Must: A generated CLI must not add E2E or real-app interaction as a universal requirement.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-005

Scope: The relevant component operations and their shared prerequisites.

Must: When existing E2E is selected as a capability, the generated CLI invokes the project-owned E2E commands.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-006

Scope: The relevant component operations and their shared prerequisites.

Must: The generated CLI and its usage instructions must be owned by the target repository.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-007

Scope: The relevant component operations and their shared prerequisites.

Must: A newly created or repaired CLI capability must be exercised successfully before it is reported usable.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-008

Scope: The relevant component operations and their shared prerequisites.

Must: CLI maintenance must detect drift between the agreed capabilities and the current project commands or tooling.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-009

Scope: The relevant component operations and their shared prerequisites.

Must: CLI maintenance must propose additions or removals instead of silently changing the agreed capability set.

Why: The user explicitly replaced the generic verify abstraction with tailored project CLIs, allowed agent proposals, and made E2E/real-app capabilities a per-project decision.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-010

Scope: inspect, propose.

Must: Project CLI inspection and unsolicited proposals must not execute repository scripts or write project files.

Why: Even commands called doctor or dry-run can mutate; static discovery is the default.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-011

Scope: create.

Must: An accepted project CLI proposal must identify the exact project and capability set before creation starts.

Why: Acceptance of one proposal is not permission to generate another project or extra capabilities.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-012

Scope: create.

Must: Project CLI creation must refuse to overwrite an existing CLI or user-edited artifact implicitly.

Why: Existing project entrypoints are user-owned.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-013

Scope: artifact contract.

Must: The generated manifest must describe each capability invocation, effect, prerequisites, result interpretation and cleanup.

Why: Another agent must be able to use the CLI cold without reverse-engineering helper scripts.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-014

Scope: execution result.

Must: A project check failure must remain a project check failure even when the CLI transport and result parsing operate correctly.

Why: CLI usability and product correctness are separate dimensions.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-015

Scope: maintain.

Must: Maintenance must restrict repairs to CLI-owned artifacts and report product regressions separately.

Why: A maintenance request must not become an unrequested product rewrite.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-016

Scope: maintain.

Must: Maintenance must preserve manually modified artifacts and require a reconciled patch rather than overwriting them from old generated state.

Why: Source and generated instructions drift independently.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-017

Scope: proof.

Must: Project CLI execution proofs must retain artifacts after cleanup and identify unexercised capabilities honestly.

Why: Cleanup cannot delete the only evidence, and one successful action cannot certify all capabilities.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### PROJECTCLI-018

Scope: maintain.

Must: Project CLI maintenance must not commit, push or open an MR unless shipping is separately requested.

Why: The inspiration skill shipped a PR automatically; the user explicitly chose request-scoped shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `inspect`

Effect: read-only. Inputs and output data: [definition.json](../../tools/project_cli/definition.json).

### Rules

- Resolve an explicit project or session cwd, including a non-Git directory. Discover existing CLI/manifest, docs, package/build commands, test suites and capability declarations statically.
- Report evidence paths supporting observations. Do not execute repository scripts, install dependencies, launch apps or write generated artifacts.
- An existing suitable CLI is a valid result; do not assume a new wrapper is necessary.

### Required ordering

resolve project → read known configuration/docs → discover existing capability declarations → return observations with provenance

### Failure semantics

- PROJECT_UNAVAILABLE
- MANIFEST_UNSUPPORTED
- MANIFEST_INVALID

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PC-INSPECT-01** — Given A service uses make test and a frontend uses pnpm test:e2e. When Inspect both. Then Report their actual separate commands; no files or processes are created.

**PC-INSPECT-02** — Given The project already has a suitable CLI. When Inspect. Then Return it rather than proposing a redundant replacement by default.

## Action `propose`

Effect: read-only. Inputs and output data: [definition.json](../../tools/project_cli/definition.json).

### Rules

- Ground every proposed capability in repository evidence or an explicit user requirement. Distinguish existing commands, missing prerequisites and newly proposed helpers.
- Identify artifact paths, effect types, prerequisites, command/result interpretation and how each capability can be exercised. Do not insert E2E/browser capabilities solely because the project has a UI.
- Proposal identity binds the canonical project path, selected capability definitions and intended artifact/dependency changes. Present conflicts/uncertainties; no caller approval flag grants scope.
- A proposal request may be suggested by the agent, but creates no project files and executes no scripts.

### Required ordering

inspect static project → resolve requested versus discoverable capabilities → construct explicit plan and proposal identity → present for acceptance

### Failure semantics

- CAPABILITY_UNKNOWN
- CAPABILITY_AMBIGUOUS
- PROJECT_UNAVAILABLE

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PC-PROP-01** — Given A library has tests and build but no E2E. When Propose CLI. Then Offer supported library operations without adding browser infrastructure.

**PC-PROP-02** — Given A web project has E2E, but only build/lint were requested. When Propose. Then Do not silently add E2E to the agreed scope.

**PC-PROP-03** — Given Proposal targets project A. When Accept then change invocation to B. Then Acceptance does not authorize B without a new matched scope.

## Action `create`

Effect: local-write. Inputs and output data: [definition.json](../../tools/project_cli/definition.json).

### Rules

- Require an accepted matching proposal or an explicit creation request with resolved project/capabilities; ask only about unresolved scope.
- Use project-native scripts/tooling and a small CLI decision layer. The manifest records schema version, capability IDs, descriptions, executable/argument vectors, cwd, effects, prerequisites, exit/result semantics, evidence and owned cleanup.
- Refuse conflicting existing files unless the accepted plan explicitly reconciles them. Stage generated artifacts, validate them and preserve original files if generation fails.
- Do not silently alter product code, global configuration or capability scope to make a command work. Needed dependency changes/install steps must be part of the accepted plan.
- Exercise each capability against its declared expected observations and a meaningful failure path where feasible. Record actual check outcomes faithfully; failing product tests are not a parser success mislabeled pass.
- Capabilities not safely exercised remain draft/blocked with exact prerequisites. Cleanup every owned failed attempt and preserve evidence.

### Required ordering

match authorization/proposal → preflight artifacts and prerequisites → generate scoped staged changes → validate command definitions → exercise agreed capabilities → cleanup owned state → report per-capability proof and patches

### Failure semantics

- PROPOSAL_NOT_ACCEPTED
- PROPOSAL_CHANGED
- ARTIFACT_CONFLICT
- PREREQUISITE_MISSING
- PROOF_BLOCKED
- GENERATION_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PC-CREATE-01** — Given Accepted scope contains types and an existing E2E script. When Create and exercise. Then Only those capabilities are generated; E2E delegates to that script.

**PC-CREATE-02** — Given An existing user-owned entrypoint conflicts. When Create. Then Refuse implicit overwrite and preserve content.

**PC-CREATE-03** — Given A command executes but product tests fail. When Exercise. Then Report actual failed checks separately from CLI operation; do not rewrite product tests.

**PC-CREATE-04** — Given A safe live prerequisite is absent. When Create. Then Keep that capability unproven; do not claim all capabilities usable.

## Action `maintain`

Effect: local-write. Inputs and output data: [definition.json](../../tools/project_cli/definition.json).

### Rules

- Locate the existing repository-owned CLI and accepted manifest; if none exists, report missing target and propose creation instead.
- Compare command/config/source ownership and feature map with current project behavior. Classify findings as CLI/doc drift, product regression, capability addition/removal proposal or unmet prerequisite.
- A maintenance request authorizes repairs inside CLI-owned artifacts for existing capabilities. Preserve manual edits via a reconciled patch; scope changes require user acceptance. Product fixes and shipping remain separate requests.
- Use only the agreed capability interaction model: run existing E2E for E2E capabilities, do not demand a generic browser pass for every project.
- Re-exercise every repaired capability and relevant unchanged capability impacted by the repair; report other coverage honestly. Doctor/recover owned instances after surprising failures. Evidence survives cleanup.
- Return clean, changed or blocked with per-capability results; do not force a branch, commit or MR as part of maintenance.

### Required ordering

resolve manifest → read source/command churn → classify drift and propose scope changes → repair agreed owned artifacts → re-exercise affected capabilities → cleanup and report

### Failure semantics

- CLI_NOT_FOUND
- MANIFEST_UNSUPPORTED
- MANUAL_EDIT_CONFLICT
- PRODUCT_REGRESSION
- CAPABILITY_DECISION_REQUIRED
- PROOF_BLOCKED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**PC-MAINT-01** — Given An accepted test script was renamed. When Maintain. Then Repair the owned invocation and exercise it; preserve the existing capability ID.

**PC-MAINT-02** — Given A new E2E suite appears outside the accepted capability set. When Maintain. Then Propose adding it without silently modifying scope.

**PC-MAINT-03** — Given The CLI is correct and a real product journey regressed. When Maintain. Then Report product regression; do not alter product code or weaken the feature map.

**PC-MAINT-04** — Given Everything agrees and exercises correctly. When Maintain. Then Return clean without a manufactured patch or MR.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- A static proposal cannot prove app behavior.
- Capabilities that cannot be exercised safely remain explicitly unproven; one exercised capability does not certify the others.
- Dependency/package versions and artifact location overrides are project decisions, not universal harness defaults.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- /Users/kento/Documents/gitlab/dashboard-extensions/conversation-center-ext/.agents/skills/create-verification-skill/SKILL.md
- /Users/kento/Documents/gitlab/dashboard-extensions/conversation-center-ext/.agents/skills/maintain-verification-skill/SKILL.md

## Enforced module boundary

See [module interface](../../architecture/modules/project-cli.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
