# Project checks

Run from the harness checkout:

```sh
pnpm project inspect --project /path/to/repo --json
pnpm project check --project /path/to/repo
pnpm project check --project /path/to/repo --json
```

Alternatively put the harness `bin` directory on PATH and use `project inspect` or `project check` from a target repo. Node 24 and installed harness dependencies are required. Discovery is read-only; it never imports project configs, executes scripts, installs dependencies or writes project files. Execution runs trusted project commands and package managers, which may have their own effects (including package-manager dependency refresh).

## Discovery and selection

Discovery inventories root package scripts using common aliases and known tools: `ts:check`/typecheck/tsc/tsgo, lint and formatting tools, unit runners, Fallow/Knip, Playwright/Cypress E2E, builds and named custom checks. It attaches package/config provenance and matching references from root AGENTS/CLAUDE/README/CONTRIBUTING and local GitLab/GitHub CI files. CI conditions, remote includes and arbitrary prose are not interpreted as unconditional local requirements.

An explicit `project-checks.json` selects the exact mandatory suite. Otherwise prefer an existing check/verify command, examine its known command/alias coverage, and add uncovered ordinary type/lint/format/unit/dead-code checks. `check: ultracite check` covers lint/format, so ts:check, test and fallow remain separate requirements. An understood `pnpm lint && pnpm typecheck && pnpm test` aggregate avoids duplicate runs. Opaque scripts, echoed command text, pipelines, ignored failures and conditionals cannot establish aggregate coverage. Literal local aliases are bounded and recursive aggregate chains block rather than loop.

Inventory entries state `selected`, `covered` (with the actual referencing aggregate), or `available` with a reason. Alternative coverage/watch/UI commands are not silently treated as executed. E2E/build/custom checks remain available until project-specific configuration selects them, or a selected existing aggregate includes them. A repo with only E2E can be inspected; running without an explicitly selected suite blocks rather than producing an empty pass. Known fix/watch/UI commands are excluded from defaults. This is bounded static discovery, not a proof of command adequacy or a general shell interpreter.

For Conversation Center, automatic discovery selects check, ts:check, test and fallow while exposing E2E, build, test:coverage and custom checks with evidence and reasons. `--json` exposes the inventory in both inspection and execution reports. Text output lists selection states and labels the result as the selected suite, not full application/CI certification.

## Explicit configuration

```json
{
  "checks": [
    {
      "id": "verify",
      "command": "make",
      "args": ["check"],
      "cwd": ".",
      "timeout_ms": 120000
    }
  ]
}
```

Use `--config relative/path.json` for another project-contained file. Non-Node projects and custom conventions use explicit commands. IDs are unique (including colon-separated script names), args are literal argv values, cwd defaults to the project root and timeout_ms defaults to 60000. Inferred unit suites/aggregates including unit checks allow 180000ms. Limits are 64 required checks, 512 package scripts, 1 MiB of JSON, alias depth 32 and one hour per check. Optional source reads are bounded to local files, 256 KiB per file and bounded CI directory traversal. Working directories must resolve inside the selected project. Selection never edits the project or manufactures a configuration file.

Commands run sequentially. Failed/unavailable/timed-out checks stop execution by default and later entries are not_run. Add --keep-going to attempt later required checks while preserving failures and nonzero exit. Cancellation and the global deadline always stop dispatch. JSON reports record keep_going. Logs retain at most 64 KiB per stream per check; `truncated` describes diagnostic display, separately from the known command exit. Exit codes: 0 complete selected-suite success, 1 failed/incomplete execution, 2 invalid/missing setup/selection, 130 cancellation. Host AbortSignal/deadline is separate from project-controlled JSON. Scoped interruption terminates owned process groups; completed effects are not rolled back. No automatic repair, dependency installation, generated framework or shipping.

## Development verification

The public module port exports inspectProjectChecks and runProjectChecks. Standard Pi registration is implemented; see [Pi setup](../../docs/pi-integration.md). Legacy authoring/maintenance and execute_capability ports remain deferred.

Covenant/TLA+ are development-only. The completion model checks two mandatory checks; the selection model checks representative ordinary/E2E categories, explicit precedence and omitted coverage. Real filesystem/process/CLI tests verify the implementation and parser cases. These finite models and explicit test-bound correspondence do not prove arbitrary-list/category equivalence, underlying project correctness, shell-program semantics, continuous isolation or termination. The actual runner does not load models or Covenant.

Standalone commands in local CI `script`/`run` and instruction code blocks/backticks can fill missing ordinary categories. Only known literal tool invocations are supported; simple quoted bash/sh wrappers are unwrapped, never executed during discovery. Source file/line provenance is retained. TypeScript compiler checks require explicit noEmit or a contained local config whose relative extends chain resolves noEmit=true; build commands are never substituted. README samples remain available. Environment setup, shell control flow, fix/watch/UI flags and unsupported configuration inheritance require explicit project selection. Browser install/codegen helpers are categorized as setup and never auto-selected.

The optional execution-mode model explores 138 states and three invariants; last-result-wins, dispatch after stop and premature keep-going termination are deliberately detected. Together the three models have eight detected deliberate faults. Modeling remains a development activity only.
