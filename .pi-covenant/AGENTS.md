# Pi Covenant design boundaries

Read README.md, docs/open-decisions.md and the relevant contracts before working.

- The host is standard Pi with agreed custom tools and controls.
- Do not read, copy, import or depend on implementation code in /Users/kento/dotfiles/.pi-custom-harness. Its documentation may be used as behavioral reference, with historical recommendations distinguished from current decisions.
- Keep design-only work separate from implementation authorization. The current obligations are drafts with acceptance scenarios, not passing evidence.
- Use Covenant design checking before implementation for applicable state/coordination logic, with explicit assumptions and deliberate specification faults. Bind executable implementation checks to the model; never add TLA+ or Covenant to the tool runtime.
- Use Covenant to define and test harness features during development. Do not impose Covenant verification or shipping gates on ordinary product sessions.
- Preserve explicit shipping scope. An MR is not required for ordinary completion, and a blocker must not start another agent turn automatically.
- Fleet v1 is read-only status and versions; other fleet mutations are deferred.
- Project CLIs have agreed per-project capabilities. The agent may propose creation; an unsolicited proposal does not itself authorize writing the CLI.
- Resolve behavior questions before implementation. Add meaningful executable acceptance checks and stable bindings before activating obligations. Never claim schema validation proves behavior.

- Before implementing any module, read architecture/README.md and its architecture/modules/<component>.json. Use only declared provider operations and owned source/test roots. Interface changes require coordinated consumer updates.
- Run `pnpm check:contracts` and `pnpm test` after contract changes. TypeScript checks enforce architecture consistency; executable acceptance includes deliberate violations.

# Learning more about Effect

This repository uses the Effect TypeScript library. Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and follow its required links. Search `node_modules/effect/src` for uncovered APIs. Pin dependency versions through pnpm-lock.yaml. Keep pure policy separate from scoped effects.

Worktree, the project check runner, Pi foundation integration and local repository context are authorized. Other runtime modules remain design-only until requested. Run `scripts/verify-bootstrap.sh` after changes; it typechecks, checks module boundaries and runs all active Covenant obligations.

# Quality tooling

The harness lives in `.pi-covenant`. Run `pnpm check`, `pnpm fallow`, and `pnpm typecheck` when editing TypeScript, then the full bootstrap script. Ultracite uses Oxlint/Oxfmt with core and Vitest presets. Preserve the configured `contractTest` support and Effect factory exception. Fallow's entrypoint is the declared public worktree module; do not suppress real dead-code findings or treat every implementation file as an entrypoint.

# Source layout

Colocate tests under each module's src directory. Group behaviors by noun folder and verb file, such as creation/create.ts and creation/create.test.ts. Keep descriptive exported symbols and module-port.ts as the public boundary. Shared test fixtures belong in the module's testing directory. Preserve exact contract-test IDs when moving files.
