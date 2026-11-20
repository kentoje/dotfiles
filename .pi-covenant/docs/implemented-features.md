# Implemented harness features

Worktree is the first implemented module. Its ten existing obligations retain 22 executable Vitest checks. Four development-tooling obligations add four checks; fourteen project-check obligations add twelve checks, plus eight foundation, three local-context, 19 GitLab, 17 Jira and Jira preflight, 17 MR and MR guard, 11 shipping, eight Fleet and five retrospective obligations. The full suite covers 122 active obligations and 111 tests. The remaining 47 obligations are draft. Standard Pi registration and local repository context include declared project check, Jira and capability configuration.

Implemented operations: new, verify, list and rm through makeWorktreeModule in src/worktree/module-port.ts. Tests use real temporary Git repositories and controlled setup subprocesses. Coverage includes path/symlink/target safety, native and delegated creation, idempotent reuse, partial setup failure and subsequent inspection, managed-only listing, removal safety for dirty/ignored/untracked/locked/current/ahead states, retained branches, replacement-directory protection, mutation coordination, cancellation with descendant process cleanup, inherited deadlines, output schemas, and lock cleanup failures without deleting replacement state.

Run `pnpm check` for formatting/lint, Fallow dead code and boundaries, TypeScript, architecture checks, and full native Covenant verification. Install a local CLI with `pnpm setup:covenant /path/to/covenant`, or set COVENANT_BIN. Immutable development reports are under .covenant/dev-runs/<run-id>; native evidence is under .covenant/runs/<run-id>.

Run `pnpm probe:worktree` for disposable broken-behavior and missing-evidence probes. Results append under .covenant/probes without rewriting prior evidence. These are controlled faults, not a Stryker score.

Known boundaries: configuration/setup is explicitly supplied by a trusted host; no automatic project setup discovery. Pi registers worktree, project_cli, gitlab, jira, mr and fleet. External Git processes do not honor the module lock. Setup is trusted executable code; ignored files conservatively prevent removal. Abandoned mutation locks require inspection. Installed dependencies are pinned in pnpm-lock.yaml. All verification tooling is TypeScript or shell, with no Python dependency. Product sessions do not require Covenant and are not gated by this development workflow.

Quality tooling: Ultracite with Oxlint/Oxfmt and the Vitest preset, plus Fallow with an explicit public module entrypoint. Lint/format and dead-code checks run in scripts/verify-bootstrap.sh before architecture and behavior verification. The directory/package/project spelling is now pi-covenant; old immutable run evidence is retained.

Worktree source and acceptance tests are colocated by behavior under src/worktree: creation/create, inspection/inspect, removal/remove, listing/list and invocation/bound. Shared fixtures live in testing/fixture.ts; module-port.test.ts covers result schemas. The root tests directory is removed. All 22 existing test identities and ten obligation meanings are preserved.

Development tooling verifies 16 module owners, 45 declared operations and 192 schema fixtures. Its acceptance suite rejects seven architecture violations and a real forbidden import through Fallow. The full Fallow report can still show advisory complexity/duplication and development-dependency classification findings; they are not hidden by a baseline. Missing implementation modules produce expected empty-zone warnings.

## Minimal project checks

PROJECTCLI-010/014 and 019..030 are active. The inspect/check module and `bin/project check` run explicit required command lists or a minimal existing package-script suite. Acceptance uses real temporary projects/processes: read-only discovery and no implicit build/E2E, complete-plan validation before effects, canonical path containment, sequential success, honest nonzero failure, missing executables, timeouts, bounded diagnostics with explicit truncation, cancellation preserving completed results and terminating descendants, expired host deadlines, and real CLI exit/JSON behavior.

The checked design explores 44 finite states under two invariants. Premature success and dispatch after cancellation are deliberately detected by separate fault models. Seven explicit conformance bindings across the completion/selection/execution-mode models connect model actions/observations to real acceptance checks. This is finite model evidence and test-bound correspondence, not a theorem about arbitrary repos or formal refinement. Design evidence lives in .covenant/design-runs, faults in design-faults and conformance in design-conformance. pnpm check runs both design checks and full native implementation verification before checking current receipts.

Discovery now inventories named aliases and known command bodies, transitive failure-propagating aggregates, local docs/CI/config evidence and explicit selected/covered/available states. The selection model explores 500 states with NoOmittedLocal, ExplicitWins and NoImplicitE2E; all three deliberate specification faults are detected. CLI inspect and execution reports retain unselected E2E/build/alternatives rather than hiding or counting them as passed.

Real-repo acceptance: conversation-center-ext now automatically selects check, ts:check, test and fallow without a custom profile; all passed, including 687 unit tests across 173 files. Four E2E variants plus build/coverage/custom checks were discovered with evidence and selection reasons. No E2E or build was executed, and tracked target-repo files stayed unchanged.

Limitations: bounded static discovery does not interpret arbitrary project documentation/CI conditions or prove suite adequacy. Other build systems/custom instructions need project-checks.json; commands/dependencies must already exist. Reviewed profiles use the existing project CLI entrypoint. Optional preview and Storybook commands are project-owned. Standard Pi registration and the standalone CLI are usable now. The model-checker companion is a pinned development-only package loaded by the native Covenant binary; its Fallow dependency exception covers that Rust-mediated load. The actual runner does not import it.

Discovery refinements (PROJECTCLI-028..030): Knip is ordinary dead-code analysis, browser installation/codegen are setup helpers, and supported literal standalone CI/instruction checks carry source provenance. Read-only compiler configuration parsing avoids running full builds. Optional --keep-going retains every failure while attempting later checks; cancellation/deadlines still stop dispatch. The execution-mode model explores 138 states under three invariants and detects all three deliberate faults (eight faults across all three models).

Assets Page live trial: automatic selection now includes check, test, knip and the standalone CI TypeScript command. A keep-going run attempted all four, preserving their existing failures and returning exit 1. No build or E2E ran; application issues were not repaired. Discovery remains bounded: remote includes, CI conditions, arbitrary shell programs and package-based TypeScript extends are unsupported.

## Standard Pi integration and local context

Foundation registers project_cli, worktree, gitlab, jira and mr, validates action-specific requests, resolves each invocation's context, supplies one host deadline and forwards cancellation. Results preserve module details, failures and partial committed effects; bounded text carries actionable diagnostics. Progress exposes context and execution stages. Standard completion and prompt behavior remain in Pi. Covenant is used during development.

Local repository-context reads canonical project/Git metadata without processes or remote queries. Tests cover linked worktrees, symlinks, non-Git projects, explicit conflicts and missing targets. Worktree configuration is supplied only through an explicit absolute host file, matched by canonical repository path and safe namespace. Project-controlled declarations cannot provide setup or approval flags. All four worktree actions run through the adapter in acceptance.

The real Pi 1.5.0 loader and an isolated in-memory AgentSession verify additive registration, retained built-ins and check execution through the actual SDK wrapper. No model API call or global user configuration change is needed. The invocation design exhaustively explores 32 finite states under ValidatedDispatch, NoDispatchAfterStop and TruthfulResult; three deliberate faults are detected. Across the harness, combined development evidence covers 15 models, 45 deliberate faults and 45 explicit conformance bindings. Design and executable correspondence remain separate evidence layers.

Local context reports declared capabilities and a Jira project key with source paths. Pi displays check start and result events. The shared TypeBox boundary validator is used by GitLab, Jira, MR and Fleet. Broader protocol obligations remain drafts. The interactive smoke test below covers selected Pi workflows. Nonstandard Pi variants, remote repository policy and reftable refs remain unverified. See pi-integration.md for loading and host configuration.

## GitLab in Pi

All eight GitLab actions are implemented. The private opened-MR lookup supports the MR tool and creation guard. Pipeline and job reads preserve exact identity, paginate explicitly and reject inconsistent provider evidence. Logs return bounded byte windows with credential masking. Retry and cancel require exact host authority and a per-pipeline permit. Both retain indeterminate delivery when acknowledgement is unavailable. Interactive Pi uses an exact-target confirmation. Programmatic hosts can inject trusted task authority.

The read, mutation and collection models cover 52, 138 and 36 states respectively. Loopback HTTP tests exercise all routes, credential boundaries, stop behavior and rejection cases. An isolated Pi SDK session runs authenticated repository, pipeline-list and log reads with a temporary glab file. Live authenticated GitLab reads are covered by the v1 smoke test below. The interactive smoke test below covers pipeline cancellation against a loopback fixture. Live pipeline retry and cancel remain unverified. See src/gitlab/README.md and ADR-012.

## Jira and duplicate preflight

All six Jira Cloud actions and the internal duplicate preflight are implemented. Acceptance covers all six actions over an ephemeral loopback server, exact fields and identities, pagination and missing evidence, duplicate denial and changed approvals, stop before dispatch, lost responses without retry, and committed writes with unavailable readback. An isolated Pi 1.5.0 SDK session verifies actual extension registration, one authenticated read and refusal of a headless write.

The preflight and write models explore 8 and 13 states respectively. Five deliberate faults are detected and seven executable conformance bindings connect model observations to acceptance. The duplicate scan is bounded and limited to Jira visibility and indexing. Live Jira Cloud reads are covered by the v1 smoke test below. The live smoke test below covers update, comment and transition. A follow-up read-only run reached exact confirmation after extending the duplicate scan to 100 pages. Live Jira creation dispatch remains unverified. Data Center and OAuth remain outside the verified scope. See [Jira setup](../src/jira/README.md) and [ADR-013](decisions/ADR-013-jira-and-duplicate-preflight.md).

## Merge requests and creation guard

All four public MR operations and the internal creation guard are implemented. Loopback REST tests exercise exact target and patch, stale pipeline SHA, reply followed by rejected resolution, and authorized write routing. An isolated Pi 1.5.0 SDK session verifies status registration and the opt-in Bash guard across two real checkouts. A separate Git fixture verifies optional policy against committed remote-tracking refs.

The reply and guard models fully explore 15 and nine states, detect eight deliberate faults, and have eight conformance bindings. Live GitLab MR status is covered by the v1 smoke test below. The live smoke test below verifies draft creation, metadata update and discussion reply. Live thread resolution and marking an MR ready remain unverified. Guard coverage is the documented literal Bash grammar. Native draft creation and mark-ready back the explicit shipping command. See [MR setup](../src/mr/README.md) and [ADR-014](decisions/ADR-014-merge-requests-and-creation-guard.md).

## Explicit shipping

The Pi slash command runs selected local checks, preserves unrelated staged files, commits exact task paths, and pushes normally. It reuses an exact open branch MR or creates a draft. Complete review and current-head CI/job observations determine human review readiness. Interactive decisions retain declined feedback and can trigger a bounded repair or diagnosed transient retry. The run stops and reports completed effects on blockers.

The model fully explores 142 finite states and detects four deliberate faults. Five conformance bindings connect model observations to executable acceptance. A real Pi SDK command test uses a temporary checkout, bare Git remote and loopback GitLab API to verify scoped commit, normal push, draft creation and draft removal. Review and retry orchestration tests use controlled observations and explicit decisions. Interactive shipping, including the review decision prompt, is covered by the disposable terminal smoke test below. Live shipping writes remain unverified. See [shipping usage](../commands/ship/README.md) and [ADR-015](decisions/ADR-015-explicit-ship.md).

## Fleet and retrospective

Fleet status reads local Git facts, labels its comparison ref, and retains available evidence during remote failure. Versions reports exact package declarations across declared Node workspaces. The retrospective reviews current or selected sessions, preserves stable evidence references, and atomically records draft proposals with deterministic title deduplication. Pi SDK tests exercise both surfaces. Real Git and filesystem tests cover the read-only and atomic storage guarantees.

The Fleet and retrospective models cover 27 and six states. Covenant detected four deliberate faults and verified four executable conformance bindings. Optional preview and Storybook commands use the project CLI capability manifest. See [Fleet configuration](../src/fleet/README.md) and [retrospective usage](../commands/harness-retro/README.md).

## Live read-only smoke test

On 2026-11-20 an isolated Pi SDK session loaded the harness and ran authenticated GitLab repository, pipeline and MR-status reads, Jira Cloud issue search and get, and Fleet status and TypeScript declarations across assets-page and dashboard-v4. All seven calls passed. Remote mutations were exercised with loopback fixtures and disposable Git repositories. The live test used temporary credentials and configuration.

## Interactive Pi smoke test

Pi 1.5.0 ran in a disposable terminal session with a loopback model endpoint and GitLab and Jira HTTP fixtures. The terminal displayed exact-target write confirmations. Escape dismissed the Jira update and produced an authorization error with zero writes. Confirming the second Jira update and GitLab pipeline cancellation produced one request each and successful tool results. The retrospective list rendered successfully and `/ship` rejected malformed JSON. A separate interactive shipping run committed and pushed one scoped file to a disposable bare remote, preserved an unrelated staged edit, and created a draft MR. The review prompt accepted an explicit decision, posted one reply, resolved the selected thread, and marked the MR ready after current-head CI checks.

## Conversation Center live write smoke test

On 2026-11-20, authenticated harness operations updated the summary, posted a comment and transitioned a disposable Jira issue to Done with the Functions as Designed resolution. Jira readback confirmed all three changes. Harness creation returned `SEARCH_INCOMPLETE` before dispatch because the duplicate scan reached its bound. A direct Jira API request created the disposable fixture for the remaining checks. [Jira CI-7892](https://aircall-product.atlassian.net/browse/CI-7892)

The harness created a draft merge request, updated its description and replied to a disposable discussion. GitLab readback confirmed all three writes. The smoke test closed the draft and deleted the temporary branch through the provider API, then verified both cleanup results. Both pipeline records for the smoke commit had zero jobs and zero downstream triggers. The target checkout was unchanged. Live pipeline retry and cancel, thread resolution, marking an MR ready, and running the complete `/ship` command still have fixture coverage only. [GitLab MR !1419](https://gitlab.com/aircall/dashboard-extensions/conversation-center-ext/-/merge_requests/1419)

## Project profile, context and optional capability expansion

Jira checks beyond page 20 on both sides of confirmation. Acceptance finds a late duplicate and rejects exhaustion of the new bound. A real Conversation Center preflight reached confirmation and was declined with zero writes. [ADR-017](decisions/ADR-017-jira-large-project-duplicate-scans.md)

The project profile workflow proposes and publishes the repository-owned check plan, detects script changes and preserves manual edits. The profile model exhaustively explores seven states and detects stale approval in its deliberate fault. Executable tests cover exact Pi confirmation, stale proposal rejection, check execution and maintenance. [ADR-018](decisions/ADR-018-reviewed-project-profiles.md)

Local context reports the source of project declarations and ignores invalid service metadata. Pi reports individual check outcomes while preserving cancellation. Optional capability runs require declared commands and exact Pi confirmation. They propagate subprocess failure and never enter the required suite implicitly. Project owners supply preview startup and readiness, Storybook rendering, authentication, and persistent resource lifecycle behavior. [Project CLI usage](../src/project-cli/README.md)
