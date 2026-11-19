# GitLab mutation and collection models

The previously checked candidate models now run in the active design.yaml with executable conformance bindings. Run pnpm check for fresh full-project evidence. The candidate manifest is retained as the design-only snapshot. It has no implementation bindings.

Recorded model scope for this design pass (2026-11-12): Mutation exhausted 138 states with all six invariants, Reads exhausted 36 states with HonestAbsence, and all eight declared faults were detected. The native conformance command correctly rejected the proposal as implementation pending. The checker was tla-ts 0.0.7 through @covenant/model-checker 0.1.0. Reproduce and inspect fresh receipts rather than treating these counts as freshness evidence.
