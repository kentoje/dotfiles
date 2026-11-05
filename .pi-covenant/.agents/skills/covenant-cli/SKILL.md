---
name: covenant-cli
description: Use Covenant CLI to define behavioral contracts, check applicable designs before implementation, verify Cargo/Vitest behavior and model correspondence, and inspect evidence or contract changes.
---

# Covenant CLI

Use Covenant when developing contracted features, investigating failed evidence, or reviewing contract changes. In this harness it is a development workflow; ordinary product tasks do not acquire Covenant completion or shipping gates.

Use the available Covenant binary with `--project <root>` and `--json` for automation. This harness supports `pnpm setup:covenant /path/to/covenant` and `COVENANT_BIN`. Design checks require the matching `@covenant/model-checker` companion; Vitest checks require `@covenant/vitest`.

## Build a feature

1. Read the owning contracts and module interfaces. Define atomic obligations, stable IDs, assumptions and exact executable test bindings before implementation.
2. Model applicable state transitions, concurrency, retries and ownership in TLA+ first. Declare artifacts, configuration, bounds, applicability rationale, obligation-to-invariant bindings and deliberate faults in `design.yaml`. Explain when modeling is inapplicable.
3. Run `covenant design validate`, `covenant design check` and `covenant design check --faults`. Inspect counterexamples and resolve them before implementing.
4. Implement against the checked design. Bind model actions/observations to executable acceptance checks; run `covenant design conformance` and inspect `covenant design conformance --status`.
5. Finish with `pnpm check` after the last input change. Report exact design and implementation outcomes and remaining gaps.

## Other major uses

- Author: `init`, `new component`, `new obligation`, `validate`, `show`, `list`.
- Investigate: `check --obligation <ID>`, `explain <ID>`, `status`, `coverage`, `report --latest`. Scoped checks cannot establish full-project completion.
- Evolve or refactor: `diff --base <ref>`, `impact --base <ref>`, and `pack <component> --output <directory>`. Preserve active meanings; document intentional changes and reverify regenerated code.
- Optionally assess implementation-test sensitivity with `mutate <component>`; mutation does not replace design checking.

## Evidence boundaries

A design pass covers only the explored model/configuration, bounds and assumptions. It never establishes implementation existence or conformance. Conformance supplies explicit test-bound correspondence, not automatic formal refinement. Unsupported, timed-out, incomplete, missing or stale evidence cannot verify anything. The first backend supports finite Init/Next safety; temporal/liveness and pruning/reductions are unsupported. Append new runs; preserve prior evidence.
