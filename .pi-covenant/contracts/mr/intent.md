# mr: behavior contract

Status: specified design; all obligations draft. Kind: tool. Implementation and executable acceptance checks are pending.

## Purpose

Inspect and update the selected existing MR without inventing a shipping requirement or automatic watcher.

The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

## Ownership

- Existing MR selection, status, discussions, replies and requested metadata changes

## Excluded scope

- Repository/CI diagnosis owned by gitlab
- MR creation, merge, deployment or background polling as implicit tool behavior

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### MR-001

Scope: The relevant component operations and their shared prerequisites.

Must: MR status must identify the selected existing merge request and report its review and pipeline state without creating one.

Why: The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-002

Scope: The relevant component operations and their shared prerequisites.

Must: MR discussion results must retain thread identity, author, body, resolution state and available code location.

Why: The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-003

Scope: The relevant component operations and their shared prerequisites.

Must: Replying to a merge request discussion must target the requested thread and must not resolve it unless resolution was requested.

Why: The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-004

Scope: The relevant component operations and their shared prerequisites.

Must: An MR update must modify only the requested metadata of the selected existing merge request.

Why: The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-005

Scope: The relevant component operations and their shared prerequisites.

Must: Inspecting an MR or encountering a pipeline or review blocker must not start background polling or trigger another agent turn by default.

Why: The old workflow needs cheap review inspection and targeted updates. The user explicitly removed the automatic ship gate and requires explicit shipping.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-006

Scope: selection.

Must: MR selection without an IID must require exactly one open MR for the selected repository and source branch.

Why: Choosing the first result can update the wrong MR.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-007

Scope: threads.

Must: MR collection results must identify incomplete pagination and must distinguish general notes from resolvable code discussions.

Why: An absent code position or partial list must not fabricate review state.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-008

Scope: reply.

Must: MR reply must finish posting the requested comment before attempting a separately requested resolution.

Why: The resolution should not erase a discussion when its requested explanation failed to post.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-009

Scope: reply.

Must: A successful MR reply followed by failed resolution must return partial completion with the created reply ID.

Why: Repeating the whole action would duplicate the comment.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-010

Scope: update.

Must: MR metadata update must reject an empty patch and must not regenerate unspecified metadata implicitly.

Why: An agent can propose text separately; the mutation should apply only the chosen text.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### MR-011

Scope: status.

Must: MR status must associate pipeline observations with their SHA and identify a head mismatch.

Why: Old green pipelines must not imply readiness of new commits.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `status`

Effect: read-only. Inputs and output data: [definition.json](../../tools/mr/definition.json).

### Rules

- Explicit IID selects that project MR. Otherwise require exactly one open MR for the selected source branch. Zero means absent, multiple means blocked AMBIGUOUS_MR.
- Return head SHA and pipeline SHA separately; mismatches remain visible. Null unknown review count is not zero.
- This single read never creates an MR, starts monitoring, or wakes another turn.

### Required ordering

resolve repository/branch → select MR → read bounded status/review summary → return observed completeness

### Failure semantics

- AMBIGUOUS_MR
- LOOKUP_FAILED
- FORBIDDEN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**MR-STATUS-01** — Given No MR exists for the branch. When Read status. Then Return ok/absent with null MR; create nothing.

**MR-STATUS-02** — Given Two open branch MRs exist. When Read implicit status. Then Return blocked with candidates rather than first-match selection.

**MR-STATUS-03** — Given MR head is B and last green pipeline is A. When Read status. Then pipeline_matches_head=false; no current-head readiness claim.

## Action `threads`

Effect: read-only. Inputs and output data: [definition.json](../../tools/mr/definition.json).

### Rules

- Read existing selected MR; absence blocks MR_NOT_FOUND. Keep stable discussion/note IDs and actual author metadata.
- General notes have null code positions and may not be resolvable; do not manufacture a file or resolution state.
- Keep provider ordering and pagination; incomplete review collection cannot certify no unresolved feedback.

### Required ordering

select MR → fetch page → normalize general/inline differences → return completeness

### Failure semantics

- MR_NOT_FOUND
- AMBIGUOUS_MR
- INVALID_CURSOR
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**MR-THREAD-01** — Given MR contains a general note and an inline discussion. When List threads. Then General note location is null; inline location is retained.

**MR-THREAD-02** — Given Unresolved feedback lies on a later page. When Read first page. Then complete=false; no zero-unresolved certification.

## Action `reply`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/mr/definition.json).

### Rules

- Confirm the thread belongs to the selected MR and the body is nonempty before posting.
- Post exactly one reply. With resolve=false, send no resolution mutation and preserve the observed resolution state.
- With resolve=true, only resolve after acknowledged reply creation and only if resolvable. An already resolved thread needs no second resolution write.
- If reply succeeded and resolution failed, return partial with reply_id. Do not post again when only resolution remains unfinished.
- If posting outcome is unknown, return indeterminate and do not attempt resolution.

### Required ordering

select MR/thread → authorize and validate → post reply → optionally resolve → report both phases

### Failure semantics

- THREAD_NOT_FOUND
- NOT_RESOLVABLE
- RESOLUTION_FAILED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**MR-REPLY-01** — Given Thread T1 is open; T2 is unrelated. When Reply to T1 without resolve. Then Only T1 gets a comment; no resolution write occurs.

**MR-REPLY-02** — Given Reply 91 posts but resolution is forbidden. When Reply with resolve=true. Then Return partial, reply_id=91, resolution_state=failed; never duplicate comment 91.

**MR-REPLY-03** — Given Comment request times out after dispatch. When Reply. Then Return unknown/indeterminate and do not send resolve.

## Action `update`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/mr/definition.json).

### Rules

- Require title or description. Empty description explicitly clears it; absent description preserves it. Empty title is invalid.
- Apply only supplied text. The agent may generate a proposed description from commits before calling; the tool does not silently regenerate other fields.
- Validate any explicitly configured title rule before writing. Do not impose a universal ticket suffix.
- Already equal requested values return no_change=true without an unnecessary write. A successful update plus unavailable refresh is partial.

### Required ordering

select MR → validate nonempty patch and configured rules → compare current values → apply requested patch once → refresh or report partial

### Failure semantics

- EMPTY_PATCH
- TITLE_POLICY_FAILED
- MR_NOT_FOUND
- READBACK_FAILED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**MR-UPDATE-01** — Given MR has a manually edited description. When Update title only. Then The description is preserved byte-for-byte at the tool boundary.

**MR-UPDATE-02** — Given Requested title equals current title. When Update. Then Return ok/no_change without a mutation.

**MR-UPDATE-03** — Given No metadata fields were supplied. When Update. Then Return invalid input before external mutation.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Discussion identity and remote state can change concurrently.
- is_bot may be unknown; do not infer bot identity from a display name.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- https://docs.gitlab.com/api/discussions/

## Enforced module boundary

See [module interface](../../architecture/modules/mr.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
