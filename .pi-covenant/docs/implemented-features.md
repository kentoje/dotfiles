# Implemented harness features

Worktree is the first implemented module. Its ten existing obligations are active and bound to 22 executable Vitest acceptance checks. All other 119 obligations remain draft. Standard Pi registration and automatic repository context discovery are not implemented.

Implemented operations: new, verify, list and rm through makeWorktreeModule in src/worktree/module-port.ts. Tests use real temporary Git repositories and controlled setup subprocesses. Coverage includes path/symlink/target safety, native and delegated creation, idempotent reuse, partial setup failure and subsequent inspection, managed-only listing, removal safety for dirty/ignored/untracked/locked/current/ahead states, retained branches, replacement-directory protection, mutation coordination, cancellation with descendant process cleanup, inherited deadlines, output schemas, and lock cleanup failures without deleting replacement state.

Run `COVENANT_BIN=/path/to/covenant scripts/verify-bootstrap.sh` for typechecking, architecture checks, deliberate architecture violations and a fresh full-project Covenant run. The result summary is .covenant/bootstrap-result.json; immutable native evidence is under .covenant/runs/<run-id>. Inspect exact WORKTREE-001 through WORKTREE-010 outcomes. A full run currently certifies only these active worktree obligations, not the draft harness.

Run `COVENANT_BIN=/path/to/covenant uv run --with pyyaml python scripts/probe-worktree-contracts.py` for disposable broken-behavior and missing-evidence probes. Probe diagnostics are saved under .covenant/probes/<timestamp> without rewriting prior evidence. These are controlled fault probes, not a Stryker mutation score.

Known boundaries: configuration/setup is explicitly supplied by a trusted host; no automatic project setup discovery or Pi tool registration yet. External Git processes do not honor the module lock. Setup is trusted executable code; ignored files conservatively prevent removal. Abandoned mutation locks require inspection. Installed dependencies are pinned in package-lock.json; Python checking tools are invoked explicitly with uv. Product sessions do not require Covenant and are not gated by this development workflow.

Quality tooling: Ultracite with Oxlint/Oxfmt and the Vitest preset, plus Fallow with an explicit public module entrypoint. Lint/format and dead-code checks run in scripts/verify-bootstrap.sh before architecture and behavior verification. The directory/package/project spelling is now pi-covenant; old immutable run evidence is retained.

Worktree source and acceptance tests are colocated by behavior under src/worktree: creation/create, inspection/inspect, removal/remove, listing/list and invocation/bound. Shared fixtures live in testing/fixture.ts; module-port.test.ts covers result schemas. The root tests directory is removed. All 22 existing test identities and ten obligation meanings are preserved.
