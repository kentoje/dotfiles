# Harness directory and quality tooling

Status: requested by the user.

The harness directory is .pi-covenant, correcting the earlier .pi-convenant spelling. The package name, native project name, current documentation, and private worktree-state namespace use covenant consistently. Existing immutable Covenant evidence and probe reports are preserved as historical records; new runs establish current evidence after the rename. The module has not been registered with Pi or deployed into live project workflows, so no live state migration is performed.

Ultracite supplies the core Oxlint/Oxfmt presets and the Vitest preset. The project keeps named Node path imports and function declarations. Tests configure Covenant's contractTest registration as a test block, permit Vitest's assertion-message argument, and retain sequential lifecycle polling. Effect's TaggedError superclass factory has a documented local lint exception. These choices preserve framework semantics while keeping the presets enabled. TypeScript is also checked independently with tsc.

Fallow has an explicit public module entrypoint and acceptance-test entries. It checks reachable code, exports, types and dependency hygiene without treating the future Pi composition root as already implemented. Three unnecessary exported types were removed or made private. No finding baseline or blanket dead-code suppression was added. Generated evidence and third-party vendored agent guidance are excluded from source analysis and formatting.

Commands: npm run check (Ultracite lint and formatting), npm run fix, npm run lint, npm run format, npm run format:check, npm run fallow (dead code), npm run fallow:report (combined analysis). The bootstrap script runs Ultracite, Fallow dead-code checks, TypeScript, architecture checks and full Covenant verification. These are harness-development checks, not runtime gates imposed on product sessions.
