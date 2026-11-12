# GitLab brick

Status: repository-read slice implemented; CI/mutations and Pi registration remain pending. Public action schemas are tools/gitlab/definition.json; module ownership and consumer allowlists are architecture/modules/gitlab.json. implementation-plan.yml reserves exact test IDs and paths without pretending they execute. Existing active worktree, project-check and Pi integration contracts keep their meanings.

## Public behavior

| Action | Required target | Result and boundary |
| --- | --- | --- |
| repository | Resolved host/project | Observed project identity/default branch, including null for an empty repository. No clone/fetch or guessed main/master. |
| pipelines | Resolved project; optional ref/SHA/state | One explicit page, newest ID first; supplied filters intersect. No inferred latest pipeline for writes. |
| pipeline | Project + pipeline_id | Exact ID/ref/SHA/state. A failed pipeline is successful read data, not transport failure. |
| jobs | Project + pipeline_id | One page of attempts; include_retried=false by default. Preserve IDs, ref/SHA, allow_failure and retry flags when supplied. Bridges/child pipelines are not silently claimed as a complete CI graph. |
| job | Project + job_id | Exact attempt and parent pipeline. Never substitute a newer attempt with the same name. |
| logs | Project + job_id, byte offset/window | Bounded redacted text, consumed original bytes, returned bytes, continuation and decode/truncation warnings. Current EOF is not proof a running job will never append. |
| retry | Explicit project + pipeline_id + host authority | Complete current-job preflight. Zero failed/canceled jobs means no_change without POST. Otherwise one request; accepted never means green. |
| cancel | Explicit project + pipeline_id + host authority | Observe exact target; known terminal states can be no_change. Accepted and cancellation_confirmed stay separate. Confirmation means an observed canceled pipeline, not proof every runner process has terminated. |

Pipeline retry uses GitLab's pipeline endpoint and can rerun eligible failed/canceled jobs; it is not a selective unit-test retry. No manual/deployment play endpoint is exposed. Unknown pipeline states remain data for reads but cannot justify terminal no-op decisions.

lookup_open_mrs(repository, source_branch) is a private read port for MR. It filters opened MRs by exact source project/branch, preserves all matching IIDs/head SHAs/URLs, and traverses bounded pages. Zero matches is absence only after validated exhaustion. Its repository selector must include the resolved host; no default gitlab.com from a non-Git cwd.

## Responsibilities and planned interfaces

- repository-context.resolve retains local roots/HEAD and optionally supplies gitlab_target: host authority, project path, selected remote and provenance. It reads metadata only, never authenticates or performs service lookup. The optional field is emitted only when host GitLab discovery is explicitly configured.
- foundation resolves configured API origin/credential association and calls makeGitlabModule with immutable context plus narrow host callbacks. Hosts may map SSH aliases/API prefixes; the model cannot submit a token, arbitrary URL/method, approval flag or endpoint.
- GitLab owns action validation, response DTOs, allowed endpoint selection, query fingerprints, complete-scan evidence and outcome classification. Only src/gitlab/module-port.ts will be public. Consumers remain MR: lookup_open_mrs/pipeline; fleet: repository; shipping: pipeline/jobs/logs/retry/cancel.
- Host transport operations are readProject, readPipelinesPage, readPipeline, readJobsPage, readJob, readTraceWindow, readOpenMrsPage and mutatePipeline(retry|cancel). Inputs use resolved host/project numeric IDs after project lookup; no unvalidated URL forwarding. The API mapping is specified below. Credential material never crosses this port.
- Invocation context carries AbortSignal, one absolute deadline, host-derived authorization for the exact action/host/project/pipeline, and a per-pipeline mutation permit. Authority is a host policy decision, not a public boolean or a new interactive confirmation requirement. Missing authority blocks only mutation; reads remain usable.
- Transport returns bounded decoded DTO input or a structured failure with not_sent, acknowledged or unknown delivery evidence. Trace windowing/redaction belongs inside the host boundary because raw traces can contain credentials. Header exposure is allowlisted to request IDs, pagination and retry timing.

## API mapping

All paths are generated from validated IDs. Paths/namespaces are URL-encoded exactly once for project lookup; service IDs are verified against the requested target before subsequent work.

| Port | Method/path |
| --- | --- |
| readProject | GET /projects/:encoded_path_or_id |
| readPipelinesPage | GET /projects/:id/pipelines with ref, sha, status, order_by=id, sort=desc and explicit page/per_page |
| readPipeline | GET /projects/:id/pipelines/:pipeline_id |
| readJobsPage | GET /projects/:id/pipelines/:pipeline_id/jobs with include_retried and explicit page/per_page |
| readJob | GET /projects/:id/jobs/:job_id |
| readTraceWindow | GET /projects/:id/jobs/:job_id/trace, host-bounded streaming |
| readOpenMrsPage | GET /projects/:id/merge_requests with state=opened and source_branch; verify source_project_id |
| mutatePipeline | POST /projects/:id/pipelines/:pipeline_id/retry or /cancel only |

JSON shapes are decoded from unknown values. Malformed or identity-mismatched responses are errors; malformed write acknowledgements are indeterminate after dispatch. Nullable/omitted retry flags remain unavailable, never fabricated false. 401/403/404/409/429 have distinct actionable results; an unavailable private resource is not evidence of absence. 5xx, connection loss, cancellation, timeout or output exhaustion after POST cannot prove no side effect.

## Pagination and log bounds

Public lists return one page, default 50/max 100. Cursors bind version, host, numeric project ID, operation, pipeline ID, normalized filters, page size and next page; they are validated continuation hints, not authority. Never follow provider Link URLs across origins. complete=true means this result contains the whole requested collection: first page, validated end, no truncation. A final page requested through a cursor still has complete=false because earlier rows are absent from that result. Missing/contradictory pagination evidence is an incomplete/error result, not fabricated empty success. Only private MR lookup and mutation preflight aggregate pages, up to authored limits of 100 pages/10,000 rows within the original deadline; exhaustion blocks absence/no-op claims. Remote mutation during a scan means observations are not a transactional snapshot.

Default read budget is 30s with at most two attempts per eligible read; writes inherit 60s or the earlier host deadline. Only transient reads (network/429/502/503/504) may retry once, honoring Retry-After within the same deadline. No auth/schema/identity retry; no mutation replay, redirect-following, silent timeout extension or background polling. Proposed per-response JSON cap is 2 MiB; overflow is incomplete evidence, not valid prefix JSON.

Logs default to 64 KiB/max 1 MiB of model-visible UTF-8 text. Streaming retains bounded memory, skips at most a host-configured scan budget (authored default 16 MiB), and uses lookahead to establish continuation; Range support is not assumed. Offsets/source_bytes describe original trace consumption; returned_bytes describes redacted output. Known credentials crossing chunks/window edges must be redacted using bounded overlap before output. Decoding/replacement and display truncation are explicit. Secret state too large for the bounded redactor fails closed rather than outputting a potentially unredacted prefix. Transport/deadline exhaustion never masquerades as EOF. No full trace files are persisted in a repository.

## Mutation lifecycle

1. Validate all arguments; resolve canonical API host/project and explicit pipeline. Freeze action/target and acquire a nonwaiting permit keyed by host/project/pipeline. Conflicts return WRITE_CONFLICT. Independent resources remain independent; other clients are outside this local coordinator.
2. Verify trusted task authority and re-read the exact target after acquiring the permit. For retry, require a complete current-attempt scan before deriving a count or no_change. For cancel, only known terminal states justify no-op.
3. Recheck signal/deadline/authority at the send boundary. Record an unknown effect before handing a POST to transport. At most one POST per invocation, including lower-layer redirect/replay behavior.
4. A well-formed matching acknowledgement records a committed request, with actual observed pipeline state. Request acceptance does not prove retry success or canceled runners. Documented rejection with reliable response is error/blocked; unresolved delivery is indeterminate with the exact target and unknown effect.
5. Release owned permit on every exit. Cancellation before send means cancelled with no remote effects; after send it never erases delivery uncertainty or acknowledged effects. A subsequent read may inform the user, but an unchanged state cannot prove a lost retry never executed. A new user request is a new invocation; there is no automatic resubmission.

## Acceptance and scope

implementation-plan.yml lists 17 reserved contract-test identities. scenarios.yml adds concrete boundary cases; verification.yaml now binds only actual repository-read checks; broader CI/mutation obligations remain draft. Real implementation checks must use a local HTTP fixture that counts requests, temporary Git remotes, controlled process ownership and isolated Pi sessions. No live credentials, real retry/cancel or existing private harness code are required.

TLA+ checks abstract target/authority binding, single send, stop boundaries, uncertain delivery, confirmation, no-op and absence evidence. It does not prove URL parsers, TLS/auth, credential redaction, bounded bytes, distributed coordination or actual GitLab/transport behavior. models/gitlab/design-proposal.yaml declares bounds and assumptions; its conformance list stays empty until executable implementation exists. Future conformance bindings must connect Send/sends to retry-target and uncertain-write, Stop/stopped to cancellation, Confirm/confirmed to cancel, NoChange/outcome to retry-no-change, Finish/absent to mr-lookup and pagination.

The active harness manifest now includes the repository-read model and its real test-bound conformance; CI/mutation models remain candidate designs. Native proposal evidence is created in an isolated snapshot under .covenant/design-proposals/gitlab; model checks/fault detection and an expected implementation-pending conformance rejection are separate from the harness's full existing implementation run. Recheck proposal inputs whenever model, contract, schema, configuration or checker changes.

API behavior references: [pipelines](https://docs.gitlab.com/api/pipelines/), [jobs](https://docs.gitlab.com/api/jobs/), [glab API](https://docs.gitlab.com/cli/api/). Audited glab source at v1.111.0: [request](https://gitlab.com/gitlab-org/cli/-/raw/v1.111.0/internal/commands/api/http.go), [streaming output](https://gitlab.com/gitlab-org/cli/-/raw/v1.111.0/internal/commands/api/api.go), [HTTP client](https://gitlab.com/gitlab-org/cli/-/raw/v1.111.0/internal/api/client.go). Target GitLab server versions and credential bridges remain implementation-time compatibility checks.
