# Project CLI: minimal mandatory check runner

The user narrowed the first version to a small runner that executes a repository's required checks and reports whether all completed successfully. See ADR-006 and ADR-007. Existing authoring/maintenance obligation meanings remain unchanged and deferred in [the backlog](authoring-backlog.md); only shared PROJECTCLI-010/014 and new 019..027 are active for this version.

## Public behavior

Inspect is read-only. Resolve the selected project, prefer an explicit project-checks.json, otherwise inventory script aliases/known tools and prefer a known check/verify aggregate plus uncovered local type/lint/format/unit/dead-code checks. Do not add build, browser infrastructure or E2E. Repository-owned aggregate scripts and explicit configuration decide whether those checks belong. Missing executable suites, malformed mandatory configuration, ambiguous package managers and recursive aggregate scripts block instead of producing an empty pass. E2E/build/custom checks remain visible with explicit project selection reasons; configuration wins exactly.

The complete required list validates before execution. Each entry has a unique id, executable, argument vector, optional cwd relative to the selected project and a positive timeout_ms (default 60000; maximum 3600000). All directories must resolve inside the project. Commands are trusted project code, not sandboxed. No automatic dependency installation, repair, generation or shipping.

Run sequentially and stop on first failure by default. Optional --keep-going attempts later checks while retaining all failures; cancellation and the global deadline always stop dispatch. Every required check appears in the report; unexecuted entries are not_run. Exit 0 means all required checks passed, exit 1 means failed/incomplete execution, exit 2 means invalid/missing setup, and cancellation uses 130. Diagnostics are bounded to 64 KiB per stream per check; log truncation is reported independently of the known command exit. Host cancellation and an optional absolute host deadline are separate from project-controlled JSON.

## Design evidence

Covenant also checks a finite selection model (NoOmittedLocal, ExplicitWins, NoImplicitE2E) with three deliberate faults before implementation. Script recognition and source evidence remain executable-test responsibilities. Covenant checks the finite two-check model in models/project-checks before implementation. NoFalsePass prevents passing with any pending, running or unsuccessful required check. NoDispatchAfterCancel prevents starting new work after cancellation. Separate deliberate models challenge premature success and dispatch after cancellation. This is safety evidence under a fixed validated plan, not a proof of underlying repo correctness, arbitrary-list equivalence, continuous input isolation or eventual termination. TLA+ and Covenant are development-only dependencies.

## Executable evidence

Native verification.yaml binds discovery, complete-plan validation, sequential completion, failures/timeouts/missing executables/truncation, cancellation with descendant cleanup, and the actual CLI against temporary projects. Design conformance binds those executable checks to modeled actions/observations. Schema fixtures describe interface shapes; they do not prove behavior.
