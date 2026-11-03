# harness-retro: behavior contract

Status: specified design; all obligations draft. Kind: user-command. Implementation and executable acceptance checks are pending.

## Purpose

Use an explicit operator retrospective to improve the harness and maintain a deduplicated proposal backlog during early use.

The user retained retrospectives specifically to refine the setup early. The old expect-only pseudo-test and automatic shipping conventions were not selected.

## Ownership

- Current/explicitly selected session friction review
- Harness-owned backlog list and proposal records

## Excluded scope

- Automatic settle/shutdown reflection
- Product repository edits, implemented fixes, commits, MRs or autonomous agent turns

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### RETROSPECTIVE-001

Scope: The relevant component operations and their shared prerequisites.

Must: A user can explicitly request a retrospective of harness behavior and receive concrete improvement proposals grounded in observed friction.

Why: The user retained retrospectives specifically to refine the setup early. The old expect-only pseudo-test and automatic shipping conventions were not selected.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### RETROSPECTIVE-002

Scope: The relevant component operations and their shared prerequisites.

Must: Completing a session must not automatically invoke a retrospective or start another agent turn for one.

Why: The user retained retrospectives specifically to refine the setup early. The old expect-only pseudo-test and automatic shipping conventions were not selected.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### RETROSPECTIVE-003

Scope: record.

Must: Retrospective recording must retain observed friction, proposed behavior and source references without asserting a fabricated incident or measurement.

Why: Improvement decisions need traceable evidence rather than invented history.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### RETROSPECTIVE-004

Scope: record.

Must: Retrospective recording must link a matching existing backlog item rather than append an exact normalized-title duplicate.

Why: Early frequent retrospectives should not multiply the same proposal.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### RETROSPECTIVE-005

Scope: scope.

Must: Retrospectives must not implement proposed changes, modify product repositories or start shipping automatically.

Why: A reflection request authorizes harness improvement records, not a repair or release task.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `review`

Effect: local-write. Inputs and output data: [definition.json](../../commands/harness-retro/definition.json).

### Rules

- The user invocation authorizes review of the current or explicitly selected session and recording new draft harness proposals; dry_run prevents writes.
- Read current contracts, decisions and backlog first. Link concrete friction to session entry references or observed operations; do not invent metrics or incidents.
- Separate harness improvements from ordinary product work. Record proposed behavior and unresolved questions, not test implementation or a forced template.
- Link deterministic duplicates; do not auto-accept or implement proposals. Return created and existing item IDs. No future model turn is scheduled when the command finishes.

### Required ordering

resolve selected session/harness → read backlog and contract context → identify grounded friction → deduplicate and record draft items unless dry-run → report findings

### Failure semantics

- SESSION_UNAVAILABLE
- BACKLOG_INVALID
- BACKLOG_CONFLICT
- OUT_OF_SCOPE_PATH

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**RT-REVIEW-01** — Given The session contains an MR reply that required three manual lookups. When Explicitly review. Then Record a proposal citing that friction, without inventing frequency statistics.

**RT-REVIEW-02** — Given The same normalized title already exists. When Review again. Then Link the existing HBR item instead of appending another.

**RT-REVIEW-03** — Given A session settles without an operator request. When Observe settlement. Then No retrospective or follow-up model turn runs.

## Action `list`

Effect: read-only. Inputs and output data: [definition.json](../../commands/harness-retro/definition.json).

### Rules

- Read harness-owned backlog only. A missing backlog means no recorded proposals; malformed existing structure is an error, not empty.
- Preserve IDs and requested state filter, with no side effects or repairs.

### Required ordering

resolve harness backlog → parse supported format → filter and return stable order

### Failure semantics

- BACKLOG_INVALID
- OUT_OF_SCOPE_PATH

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**RT-LIST-01** — Given No backlog exists yet. When List. Then Return an empty list without creating a file.

**RT-LIST-02** — Given Existing backlog cannot be parsed. When List. Then Report malformed content, preserving the file.

## Action `record`

Effect: local-write. Inputs and output data: [definition.json](../../commands/harness-retro/definition.json).

### Rules

- Accept only harness improvement proposals with nonempty evidence and behavior; reject arbitrary product task records.
- Normalize title using Unicode normalization, trimming, whitespace collapse and case folding. An exact existing normalized match returns its ID without writing. Similar-but-not-exact matches are suggestions for review.
- Allocate the next unique HBR identifier under a harness backlog write lock. Write an atomic patch preserving existing entries; concurrent changes are reconciled or reported, never overwritten.
- Write only docs/backlog.md inside the new harness; preserve source references and proposed state, and do not add Covenant obligations automatically.

### Required ordering

validate scope/content → lock and read current backlog → check duplicate → allocate ID and atomic append → report created/existing identity

### Failure semantics

- RECORD_INVALID
- OUT_OF_SCOPE_PATH
- BACKLOG_CONFLICT

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**RT-RECORD-01** — Given Title differs from an existing item only by case and whitespace. When Record. Then Return created=false and existing ID without a write.

**RT-RECORD-02** — Given The target resolves outside harness docs. When Record. Then Reject before any file mutation.

**RT-RECORD-03** — Given Another recorder writes concurrently. When Record. Then Preserve both distinct entries with unique IDs or return a retryable conflict.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- A retrospective proposal is not an accepted design change.
- Exact normalized-title duplicate prevention is deterministic; semantic similarity remains review judgment.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/retrospective.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
