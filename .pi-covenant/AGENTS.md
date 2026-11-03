# Pi Covenant design boundaries

Read README.md, docs/open-decisions.md and the relevant contracts before working.

- The host is standard Pi with agreed custom tools and controls.
- Do not read, copy, import or depend on implementation code in /Users/kento/dotfiles/.pi-custom-harness. Its documentation may be used as behavioral reference, with historical recommendations distinguished from current decisions.
- Keep design-only work separate from implementation authorization. The current obligations are drafts with acceptance scenarios, not passing evidence.
- Use Covenant to define and test harness features during development. Do not impose Covenant verification or shipping gates on ordinary product sessions.
- Preserve explicit shipping scope. An MR is not required for ordinary completion, and a blocker must not start another agent turn automatically.
- Fleet v1 is read-only status and versions; other fleet mutations are deferred.
- Project CLIs have agreed per-project capabilities. The agent may propose creation; an unsolicited proposal does not itself authorize writing the CLI.
- Resolve behavior questions before implementation. Add meaningful executable acceptance checks and stable bindings before activating obligations. Never claim schema validation proves behavior.

- Before implementing any module, read architecture/README.md and its architecture/modules/<component>.json. Use only declared provider operations and owned source/test roots. Interface changes require coordinated consumer updates.
- Run the architecture validator and its negative checks after contract changes: `uv run --with pyyaml --with jsonschema python scripts/check-module-contracts.py` and `uv run --with pyyaml --with jsonschema python scripts/test-module-contracts.py`. These enforce design consistency, not product behavior.

# Learning more about Effect

This repository uses the Effect TypeScript library. Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and follow its required links. Search `node_modules/effect/src` for uncovered APIs. Pin dependency versions through package-lock.json. Keep pure policy separate from scoped effects.

Worktree implementation is authorized. Other modules remain design-only until requested. Run `scripts/verify-bootstrap.sh` after changes; it typechecks, checks module boundaries and runs all active Covenant obligations.

# Quality tooling

The harness lives in `.pi-covenant`. Run `npm run check`, `npm run fallow`, and `npm run typecheck` when editing TypeScript, then the full bootstrap script. Ultracite uses Oxlint/Oxfmt with core and Vitest presets. Preserve the configured `contractTest` support and Effect factory exception. Fallow's entrypoint is the declared public worktree module; do not suppress real dead-code findings or treat every implementation file as an entrypoint.

# Source layout

Colocate tests under each module's src directory. Group behaviors by noun folder and verb file, such as creation/create.ts and creation/create.test.ts. Keep descriptive exported symbols and module-port.ts as the public boundary. Shared test fixtures belong in the module's testing directory. Preserve exact contract-test IDs when moving files.
