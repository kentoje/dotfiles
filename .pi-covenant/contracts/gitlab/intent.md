# gitlab: behavior contract

Status: repository-read module and host transport implemented; CI/mutations and Pi registration pending. Kind: tool. Exact active scope is recorded in contract.yaml and the implementation tracker.

## Purpose

Give the agent structured repository and CI facts plus explicitly requested pipeline retry/cancel, while MR review operations stay in mr.

The user chose a separate GitLab tool, then explicitly included pipeline retry and cancel. The old lookup provider was too narrow to describe that surface.

## Ownership

- Repository identity and default-branch facts
- Pipeline/job lookup, exact SHA identity, bounded logs
- Explicit pipeline retry/cancel outcomes

## Excluded scope

- MR discussions, comments and metadata
- Pipeline deletion, triggering new pipelines, playing deployment jobs
- Background polling outside explicit shipping

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

The preserved original GitLab MR lookup obligations also govern the shared provider used by MR status and creation preflight. They do not add MR mutations to the separate GitLab tool.

## Obligations

### GITLAB-001

Scope: The relevant component operations and their shared prerequisites.

Must: GitLab lookup must resolve its repository and source branch from the selected working context rather than an unrelated checkout.

Why: The user chose a separate GitLab tool, then explicitly included pipeline retry and cancel. The old lookup provider was too narrow to describe that surface.

Status: active for the implemented repository-read scope. Exact executable bindings are in verification.yaml; broader action verification remains pending.

### GITLAB-002

Scope: The relevant component operations and their shared prerequisites.

Must: GitLab lookup must distinguish an absent merge request from an unavailable or malformed lookup result.

Why: The user chose a separate GitLab tool, then explicitly included pipeline retry and cancel. The old lookup provider was too narrow to describe that surface.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-003

Scope: The relevant component operations and their shared prerequisites.

Must: GitLab lookup must not create, update, merge or delete remote resources.

Why: The user chose a separate GitLab tool, then explicitly included pipeline retry and cancel. The old lookup provider was too narrow to describe that surface.

Status: active for the implemented repository-read scope. Exact executable bindings are in verification.yaml; broader action verification remains pending.

### GITLAB-004

Scope: public surface.

Must: The GitLab tool must expose repository and CI operations separately from MR discussion and metadata operations.

Why: The user explicitly selected a separate GitLab tool with distinct capabilities.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-005

Scope: pipelines, pipeline, jobs, job.

Must: Pipeline and job reads must preserve pipeline ID, job ID, ref, SHA and retried-attempt identity where available.

Why: A green result on another commit or old job attempt does not describe the requested work.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-006

Scope: logs.

Must: Job log results must state the returned byte window, truncation and whether more bytes remain.

Why: The agent needs actionable bounded output without mistaking a window for a full trace.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-007

Scope: retry.

Must: Pipeline retry must target an explicit repository and pipeline ID within an authorized request.

Why: Retrying an inferred latest pipeline can affect unrelated work.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-008

Scope: cancel.

Must: Pipeline cancellation must target an explicit pipeline and report observed state separately from request acceptance.

Why: API acceptance is not proof that all jobs have stopped.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-009

Scope: retry.

Must: A pipeline with no retryable failed or canceled jobs must be reported as an unchanged retry outcome.

Why: An accepted retry request can legitimately have no effect.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### GITLAB-010

Scope: public surface.

Must: GitLab operations must not delete pipelines, play deployment jobs or create new pipelines in v1.

Why: Those actions are outside the selected repository/CI retry-cancel scope.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `repository`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Resolve explicit repository or cwd through repository-context. A missing GitLab remote blocks only GitLab operations, not ordinary Pi work.
- Return the observed default branch; never hard-code main or master.
- Do not fetch, checkout, modify remotes or create project resources.

### Required ordering

resolve context → authenticate existing provider → read one project → return identity and observed facts

### Failure semantics

- CONTEXT_UNAVAILABLE
- AMBIGUOUS_REMOTE
- AUTH_REQUIRED
- NOT_FOUND

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-REPO-01** — Given A checkout maps to team/app with default branch develop. When Read repository. Then Return team/app and develop with no local or remote mutation.

**GL-REPO-02** — Given Two eligible remotes exist and no selection resolves them. When Read repository. Then Return blocked AMBIGUOUS_REMOTE; do not choose the first remote.

## Action `pipelines`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Intersect supplied ref/SHA/state filters; do not silently widen them.
- Order newest pipeline ID first within the returned page; preserve pipeline source and SHA.
- A truncated page is not proof of no matching pipeline.

### Required ordering

resolve project → validate filters/cursor → fetch bounded page → return items and continuation

### Failure semantics

- INVALID_CURSOR
- AUTH_REQUIRED
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-LIST-01** — Given Two pipeline pages match the branch. When Read first page. Then Return newest first, has_more=true and next cursor; complete=false.

**GL-LIST-02** — Given The provider lookup fails. When List pipelines. Then Return error, not an empty successful list.

## Action `pipeline`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Use the explicit project/pipeline pair; never substitute latest.
- Preserve exact ref, SHA and observed state. Terminal and nonterminal states are data, not tool failure.

### Required ordering

resolve project → read requested pipeline → verify response ID → return observation

### Failure semantics

- NOT_FOUND
- FORBIDDEN
- TARGET_MISMATCH

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-PIPE-01** — Given Pipeline 41 is green for old SHA A; pipeline 42 is running for B. When Read pipeline 42. Then Return B/running, never A/success.

**GL-PIPE-02** — Given Pipeline ID exists in another project only. When Read in selected project. Then Return not found; do not cross-project search or substitution.

## Action `jobs`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Keep every returned job ID and attempt flag. Default excludes prior retried attempts; include_retried explicitly includes them.
- Return allow_failure and state without promoting allowed failures into mandatory failures or vice versa.
- Pagination remains explicit.

### Required ordering

resolve explicit pipeline → fetch job page → preserve attempt identities → return completeness

### Failure semantics

- NOT_FOUND
- INVALID_CURSOR
- LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-JOBS-01** — Given A failed job was retried under a new job ID. When Read with and without include_retried. Then Default returns current attempts; explicit history retains both distinct IDs.

**GL-JOBS-02** — Given Only the first job page is available. When Read jobs. Then complete=false; no pipeline readiness assertion.

## Action `job`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Read the explicitly selected job, including its parent pipeline.
- A job from another SHA or pipeline must retain that identity; the caller decides relevance.

### Required ordering

resolve project → read exact job → verify job ID → return observation

### Failure semantics

- NOT_FOUND
- FORBIDDEN
- TARGET_MISMATCH

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-JOB-01** — Given A retry changed job ID from 8 to 9. When Read 8. Then Return the old attempt as old; do not replace it with 9.

**GL-JOB-02** — Given Job lookup times out. When Read job. Then Return bounded failure after eligible read retry, not success or absence.

## Action `logs`

Effect: read-only. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Offsets refer to the original trace byte stream; return a bounded UTF-8 decoded window and state if replacement decoding occurred in warnings.
- Known credentials are redacted before model-visible output. Returned byte count describes decoded/redacted returned content; next_offset continues the original stream.
- Do not write full unbounded logs into a product repository or claim redaction is exhaustive.

### Required ordering

read exact job trace → apply byte window → redact known credentials → return text and continuation

### Failure semantics

- LOG_UNAVAILABLE
- NOT_FOUND
- FORBIDDEN
- OUTPUT_LIMIT

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-LOG-01** — Given A trace exceeds the requested window. When Read logs with max_bytes=1024. Then Return a bounded window, truncated=true and a valid continuation offset.

**GL-LOG-02** — Given The trace contains a known configured token. When Read logs. Then Token is redacted; original credential never appears in diagnostics.

## Action `retry`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Require explicit pipeline ID and authorization from the current user task; no approval boolean and no latest inference.
- Read target first. Retry eligible failed/canceled jobs through the provider operation, not arbitrary deployment/manual jobs.
- If the API confirms no eligible work or no change, report no_change. Return observed pending/running state without claiming eventual success.
- Do not automatically repeat after conflict, rate limit or unknown write outcome.

### Required ordering

resolve and authorize → read selected pipeline/jobs → send one retry request when eligible → return acknowledged/observed result

### Failure semantics

- FORBIDDEN
- RETRY_CONFLICT
- RATE_LIMITED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-RETRY-01** — Given Explicit pipeline 42 has failed jobs. When Request authorized retry of 42. Then One retry request targets 42; return its observed state without claiming green CI.

**GL-RETRY-02** — Given The request times out after dispatch. When Retry pipeline. Then Return indeterminate; do not issue a second retry.

**GL-RETRY-03** — Given No failed or canceled jobs are eligible. When Retry pipeline. Then Return ok/no_change rather than inventing a new pipeline.

## Action `cancel`

Effect: remote-write. Inputs and output data: [definition.json](../../tools/gitlab/definition.json).

### Rules

- Require explicit selected pipeline and authorized cancel request.
- An accepted cancellation response is not proof of terminal canceled state; return observed state and confirmation separately.
- An already terminal pipeline is an observed no-op when appropriate. Never cancel another pipeline or all project pipelines.

### Required ordering

resolve and authorize → observe target → send at most one cancellation request → return requested versus confirmed state

### Failure semantics

- FORBIDDEN
- RATE_LIMITED
- REMOTE_STATE_UNKNOWN

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**GL-CANCEL-01** — Given Cancel request is accepted but jobs still stop asynchronously. When Cancel pipeline 42. Then accepted with cancellation_confirmed=false and actual observed state.

**GL-CANCEL-02** — Given Pipeline is already terminal and unchanged. When Cancel it. Then Return no_change; do not claim it transitioned to canceled.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Remote state can change immediately after observation.
- Logs are bounded/redacted best-effort; not a guarantee that all secrets are detectable.
- Retry may have no effect when no eligible jobs exist.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- https://docs.gitlab.com/api/pipelines/
- https://docs.gitlab.com/api/jobs/

## Enforced module boundary

See [module interface](../../architecture/modules/gitlab.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.

## Implementation-ready design supplement

See [brick-design.md](brick-design.md), [implementation-plan.yml](implementation-plan.yml) and ADR-010 for the tightened module/host boundary, target precedence, cursor semantics, log accounting, single-send mutation outcomes and implementation slices. GITLAB-011..017 add draft evidence/transport/authority obligations; original GITLAB-001..010 meanings are retained. The machine-readable public/module schemas are authoritative for refined DTO shape: default_branch can be null, jobs retain optional ref, and logs include has_more/source_bytes. Repository context emits gitlab_target only when GitLab discovery is explicitly configured. No GitLab tool is registered in Pi by this design pass.
