# story: behavior contract

Status: specified design; all obligations draft. Kind: project-cli-capability. Implementation and executable acceptance checks are pending.

## Purpose

Discover and render Storybook stories only when selected for that project CLI.

The user selected per-project capability placement. The old behavior of isolated iframe capture remains useful where Storybook exists.

## Ownership

- Stable story index lookup
- Isolated preview-iframe capture and owned render lifecycle

## Excluded scope

- A universal Storybook tool, unrequested installation, arbitrary browser control
- Starting an unselected preview capability or performing browser authentication

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### STORY-001

Scope: The relevant component operations and their shared prerequisites.

Must: Story discovery must return the matching stable story identities from the selected project.

Why: The user selected per-project capability placement. The old behavior of isolated iframe capture remains useful where Storybook exists.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### STORY-002

Scope: The relevant component operations and their shared prerequisites.

Must: Story rendering must target the requested preview iframe and preserve requested supported theme and viewport options.

Why: The user selected per-project capability placement. The old behavior of isolated iframe capture remains useful where Storybook exists.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### STORY-003

Scope: The relevant component operations and their shared prerequisites.

Must: Story rendering must return observable render evidence or a structured failure and clean up resources it owns.

Why: The user selected per-project capability placement. The old behavior of isolated iframe capture remains useful where Storybook exists.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### STORY-004

Scope: placement.

Must: Storybook support must be selected per project and must not be installed or exposed universally.

Why: The user chose project-specific capabilities.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### STORY-005

Scope: show.

Must: Story rendering must reject ambiguous selectors, unsupported options and unavailable instances without substituting another story.

Why: A plausible screenshot of another component is misleading evidence.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `list`

Effect: read-only. Inputs and output data: [definition.json](../../capabilities/story/definition.json).

### Rules

- Read the selected project index and return stable matching IDs in deterministic ID order.
- No match is an empty successful list; unreachable/invalid index is an error. No server startup is implied.

### Required ordering

resolve selected capability/index → read and validate index → apply selector → return IDs

### Failure semantics

- CAPABILITY_NOT_SELECTED
- INDEX_UNAVAILABLE
- INDEX_INVALID

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**ST-LIST-01** — Given No story matches a valid query. When List. Then Return ok with an empty list.

**ST-LIST-02** — Given The index cannot be read. When List. Then Return error, not the same empty response.

## Action `show`

Effect: process. Inputs and output data: [definition.json](../../capabilities/story/definition.json).

### Rules

- Validate exact story ID, declared theme and viewport before opening an owned render context.
- Require a usable selected Storybook instance; automatic startup is allowed only if it is part of this capability agreed project plan.
- Build the preview iframe route and requested globals, wait for the project-defined story-ready condition, and capture screenshot plus console observations.
- Close owned render contexts on success, failure or cancellation. Preserve artifacts and do not close borrowed browser sessions.

### Required ordering

resolve story/index → validate render options → health-check selected instance → open iframe render context → capture evidence → close owned context

### Failure semantics

- CAPABILITY_NOT_SELECTED
- STORY_NOT_FOUND
- STORY_AMBIGUOUS
- OPTION_UNSUPPORTED
- INSTANCE_UNAVAILABLE
- RENDER_FAILED
- CANCELLED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**ST-SHOW-01** — Given Story button--primary exists with dark theme. When Render at 800x600. Then Capture that iframe/theme/viewport and return the exact ID and evidence paths.

**ST-SHOW-02** — Given A selector matches two stories or requests an unsupported theme. When Render. Then Reject before opening an unrelated page.

**ST-SHOW-03** — Given Render fails after browser context creation. When Render. Then Close the owned context and retain failure artifacts.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Console errors and screenshots are observations, not a universal visual-approval gate.
- Project-selected theme names and viewport bounds must be declared, not guessed.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/story.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
