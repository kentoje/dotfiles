# jira: behavior contract

Status: specified design; all obligations draft. Kind: tool. Implementation and executable acceptance checks are pending.

## Purpose

Read, search and perform task-authorized issue operations with project-specific metadata and duplicate protection.

The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

## Ownership

- get/search/create/update/comment/transition
- Site/project/issue identity, field and transition discovery
- Truthful partial and unknown write outcomes

## Excluded scope

- Attachments, bulk operations, issue deletion and Confluence
- Inventing sprint/epic/story-point defaults
- Local ticket-binding state and automatic shipping

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### JIRA-001

Scope: The relevant component operations and their shared prerequisites.

Must: Jira reads must retain the identity of the requested issue or search results.

Why: The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-002

Scope: The relevant component operations and their shared prerequisites.

Must: Jira lookup failures must not be presented as an empty successful search or a nonexistent issue.

Why: The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-003

Scope: The relevant component operations and their shared prerequisites.

Must: Jira mutation must apply only the fields or operation authorized by the task request.

Why: The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-004

Scope: The relevant component operations and their shared prerequisites.

Must: Jira creation preflight must surface matching existing issues before a possible duplicate is created.

Why: The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-005

Scope: The relevant component operations and their shared prerequisites.

Must: A Jira mutation must report the resulting issue identity and must not report success for a failed remote operation.

Why: The user explicitly selected all six Jira actions. The tool must retain fields that differ between projects instead of imposing a generic issue template.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-006

Scope: search.

Must: Jira search must preserve the selected site and project constraints, pagination and the exact submitted query semantics.

Why: A result from another Jira context is not a useful task match.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-007

Scope: create.

Must: Jira creation must validate required project, issue type and custom fields before the first mutation.

Why: Discovering a missing required field after partial writes is avoidable.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-008

Scope: create, update, transition.

Must: Jira field names must resolve unambiguously to current field metadata or return an actionable field error.

Why: Custom field IDs and names vary between projects.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-009

Scope: update.

Must: Jira update must reject an empty patch and must preserve fields absent from the requested patch.

Why: A metadata update is not a replacement issue document.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-010

Scope: comment.

Must: Jira comments must preserve the requested issue and body without silently posting an additional comment on uncertain retry.

Why: Comment creation is non-idempotent.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-011

Scope: transition.

Must: Jira transitions must use an available transition ID or an unambiguous available name for the current issue.

Why: Workflow names and transition IDs are project-specific and state-dependent.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### JIRA-012

Scope: write result.

Must: A Jira mutation followed by a failed readback must distinguish the committed write from the unavailable resulting view.

Why: A readback failure must not invite the agent to repeat a successful mutation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `get`

Effect: read-only. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Resolve the configured site or explicit site; never search another site to satisfy a key.
- Return stable key, actual status and requested fields; absent/null/unavailable fields remain distinct.
- Permission/not-found errors retain provider semantics without leaking unauthorized issue data.

### Required ordering

resolve site → read issue → validate identity → return fields

### Failure semantics

- AUTH_REQUIRED
- FORBIDDEN_OR_NOT_FOUND
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-GET-01** — Given Two sites contain the same issue key. When Get the key from selected site A. Then Return A only, with site context.

**JI-GET-02** — Given Issue cannot be read. When Get issue. Then Return an actionable read error, not an empty invented issue.

## Action `search`

Effect: read-only. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Pass query as data, not interpolated shell. If project is supplied, constrain results to it rather than broadening query scope.
- Preserve provider ordering and continuation. An empty complete result differs from an unavailable or incomplete search.

### Required ordering

resolve site/project → validate query/page → search once with bounded read retry → return page

### Failure semantics

- INVALID_QUERY
- AUTH_REQUIRED
- LOOKUP_FAILED
- INVALID_CURSOR

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-SEARCH-01** — Given A valid query has no visible matches. When Search. Then Return ok with an empty complete page.

**JI-SEARCH-02** — Given Search is unavailable. When Search. Then Return error, not the same empty result.

**JI-SEARCH-03** — Given Results span two pages. When Read first page. Then Return continuation and complete=false.

## Action `create`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Validate issue type, required fields and supplied custom fields before mutation. Names must resolve uniquely; never discard unsupported fields silently.
- Project, issue type and summary arguments cannot be overridden by conflicting keys inside fields.
- Run jira-preflight on the exact proposal. With no exact duplicate, existing user creation authorization is sufficient; with a match, use a proposal-bound duplicate decision.
- Send one creation request; return the real key/ID. A timeout after dispatch is indeterminate, not an excuse to create again.

### Required ordering

resolve metadata → validate complete proposal → duplicate preflight/decision → create once → return remote identity/readback

### Failure semantics

- FIELD_REQUIRED
- FIELD_AMBIGUOUS
- FIELD_UNSUPPORTED
- DUPLICATE_DECISION_REQUIRED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-CREATE-01** — Given Required custom field Sprint is missing. When Create issue. Then Return field guidance without sending a create request.

**JI-CREATE-02** — Given An exact normalized summary match exists. When Create without duplicate decision. Then Return blocked with candidates and no mutation.

**JI-CREATE-03** — Given Server creates the issue but the client loses the response. When Create. Then Return indeterminate and do not automatically create a second issue.

## Action `update`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Patch only named fields. Omitted fields remain untouched; clearing a field requires an explicit null/empty value supported by that field.
- Disallow moving the issue/project through this generic patch. Resolve issue-type and custom-field metadata for the selected issue.
- If the write is acknowledged and refresh fails, return partial with committed fields and readback_complete=false.

### Required ordering

resolve issue and editable fields → validate patch/authorization → send patch once → refresh resulting issue or report partial

### Failure semantics

- EMPTY_PATCH
- FIELD_UNSUPPORTED
- FIELD_AMBIGUOUS
- FORBIDDEN
- READBACK_FAILED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-UPDATE-01** — Given Summary and labels already exist. When Update summary only. Then Labels remain unchanged and response identifies summary as the changed field.

**JI-UPDATE-02** — Given Provider acknowledges update; following read fails. When Update. Then Return partial with acknowledged mutation; no automatic repeat.

## Action `comment`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Preserve the requested body under the provider-supported rich-text representation; do not prepend generated text or post elsewhere.
- Read/validate the issue before posting. Do not alter fields or transitions.
- Non-idempotent comment creation is never automatically repeated after uncertain completion.

### Required ordering

resolve issue → validate requested comment → post once → return comment ID

### Failure semantics

- FORBIDDEN
- INVALID_BODY
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-COMMENT-01** — Given Two issues exist. When Comment on CI-123. Then Only CI-123 receives the requested body and returned comment ID.

**JI-COMMENT-02** — Given Posting times out after dispatch. When Comment. Then Return indeterminate; no second comment appears from automatic retry.

## Action `transition`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/jira/definition.json).

### Rules

- Resolve an exact available transition ID or uniquely matching available name for the current issue. Do not equate target status text with a transition ID.
- Return available choices when absent/ambiguous. Validate required transition-screen fields before posting.
- Change no unrelated fields. If state changes concurrently, report the actual conflict and do not select another transition.

### Required ordering

read current issue/available transitions → resolve transition → validate required fields → transition once → refresh state

### Failure semantics

- TRANSITION_UNAVAILABLE
- TRANSITION_AMBIGUOUS
- FIELD_REQUIRED
- STATE_CONFLICT
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**JI-TRANS-01** — Given Two available transitions share a name. When Transition by name. Then Return choices without mutation.

**JI-TRANS-02** — Given A selected transition requires a resolution field. When Omit that field. Then Return FIELD_REQUIRED before the mutation.

**JI-TRANS-03** — Given The transition succeeds but refresh fails. When Transition. Then Return partial with the acknowledged transition ID, not a fabricated final state.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Search and permission visibility are not proof that no invisible duplicate exists.
- Remote changes can race metadata reads; report provider validation failures without silent field dropping.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/

## Enforced module boundary

See [module interface](../../architecture/modules/jira.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
