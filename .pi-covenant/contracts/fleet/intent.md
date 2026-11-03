# fleet: behavior contract

Status: specified design; all obligations draft. Kind: tool. Implementation and executable acceptance checks are pending.

## Purpose

Answer multi-repository status and declared package-version questions without changing any repository.

The user explicitly selected status and versions and deferred all fleet mutations. The tool should reduce repeated read calls, not become repository management automation.

## Ownership

- Selected configured repository set
- Read-only local Git and one-shot remote MR observations
- Version declarations with manifest provenance and per-repository errors

## Excluded scope

- Sync, install, prune, fetching and resetting repositories
- Bulk mutation or continuous monitoring

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### FLEET-001

Scope: The relevant component operations and their shared prerequisites.

Must: Fleet v1 exposes repository status across the selected repositories.

Why: The user explicitly selected status and versions and deferred all fleet mutations. The tool should reduce repeated read calls, not become repository management automation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-002

Scope: The relevant component operations and their shared prerequisites.

Must: Fleet v1 reports the requested package version for each selected repository and explicitly identifies missing declarations.

Why: The user explicitly selected status and versions and deferred all fleet mutations. The tool should reduce repeated read calls, not become repository management automation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-003

Scope: The relevant component operations and their shared prerequisites.

Must: Fleet status and versions must not mutate repository contents, Git refs or installed dependencies.

Why: The user explicitly selected status and versions and deferred all fleet mutations. The tool should reduce repeated read calls, not become repository management automation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-004

Scope: The relevant component operations and their shared prerequisites.

Must: Fleet v1 must not expose sync, install or prune as supported actions.

Why: The user explicitly selected status and versions and deferred all fleet mutations. The tool should reduce repeated read calls, not become repository management automation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-005

Scope: selection.

Must: Fleet selection must use explicit repository IDs or the configured repository set and reject unknown selections before inspection.

Why: A typo must not silently broaden a fleet operation.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-006

Scope: status.

Must: Fleet status must identify the comparison ref and must not fetch remote branches implicitly.

Why: Ahead/behind counts are meaningful only relative to an explicit locally observed ref.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-007

Scope: versions.

Must: Fleet versions must preserve manifest path, dependency section and declared specification without substituting installed versions.

Why: A package range, workspace alias and installed version are different facts.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FLEET-008

Scope: status, versions.

Must: Fleet must preserve per-repository failures, report partial results when some repositories succeed and report failure when none succeed.

Why: One unavailable repository should not erase useful results or look fully successful.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Action `status`

Effect: read-only. Inputs and output data: [definition.json](../../tools/fleet/definition.json).

### Rules

- Omitted repositories selects all configured fleet IDs in configured order; explicit unknown IDs block before lookups, and duplicates are deduplicated preserving first occurrence.
- For each repository return branch/null detached state, HEAD, dirty tracked/untracked observations and ahead/behind with the named local comparison ref. Never fetch implicitly. Unknown comparison is null with a reason, not zero.
- Read open branch MR state once when a GitLab context exists. Remote failure preserves local facts as a partial repository result, never no MR.
- Continue independent repositories after one failure. Top-level ok requires all requested observations; partial means at least one success and an incomplete repository; all failures is error.

### Required ordering

validate selection → read each selected local context → read optional remote state once → aggregate in requested order

### Failure semantics

- UNKNOWN_REPOSITORY
- LOCAL_LOOKUP_FAILED
- REMOTE_LOOKUP_FAILED

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**FL-STATUS-01** — Given Repo A is clean, repo B is dirty and has no comparison ref. When Read both. Then Return both identities; B has unknown counts and an explicit missing basis.

**FL-STATUS-02** — Given B GitLab lookup fails while its local Git read succeeds. When Read status. Then Keep B local facts and mark partial; do not assert no MR.

**FL-STATUS-03** — Given Selection contains an unknown ID. When Read fleet. Then Return invalid selection before silently adding all repositories.

## Action `versions`

Effect: read-only. Inputs and output data: [definition.json](../../tools/fleet/definition.json).

### Rules

- Use the same explicit fleet selection rules.
- Read configured manifest locations; for Node projects use the root and declared workspace manifests. Do not crawl unrelated node_modules or home state. Unsupported manifest readers are explicit per-repository errors.
- For every declaration preserve manifest-relative path, section and exact spec (including workspace/catalog/alias syntax). Mark missing only after all selected supported manifests were read successfully.
- Do not install, resolve remote versions, rewrite manifests or equate a declared range with a lockfile/installed version. Multiple declarations remain multiple records.
- Malformed manifest means repository error, not missing package; independent repositories continue.

### Required ordering

validate package/selection → resolve declared manifest set → read declarations → return per-repository provenance and aggregate status

### Failure semantics

- UNKNOWN_REPOSITORY
- MANIFEST_INVALID
- MANIFEST_UNSUPPORTED
- MANIFEST_UNAVAILABLE

Use the shared result statuses; preserve completed effects on partial, cancelled or indeterminate results. A failure does not imply rollback.

### Acceptance examples

**FL-VER-01** — Given A declares ui as ^2.3.0, B declares workspace:*, C has no declaration. When Compare ui. Then Return those exact specs with path/section and explicit missing for C.

**FL-VER-02** — Given B package.json is malformed. When Compare versions. Then B is error, not missing; A and C remain available.

**FL-VER-03** — Given Two workspaces declare different versions. When Compare a package. Then Return both declarations rather than choosing one.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- Cached remote-tracking refs may be old; report comparison basis and observation time.
- Version ranges, aliases and workspace declarations are not automatically equivalent resolved versions.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/fleet.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
