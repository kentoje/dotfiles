# Active GitLab repository-read model

Read.tla models one repository invocation: an allowed resolved host, an available credential, up to two application attempts, complete/invalid/transient/rejected observations, cancellation/deadline stop and final success. Read.cfg declares BoundedReads, HostBeforeRead, NoStoppedDispatch and TruthfulRead. Complete exploration covers 52 states within the manifest's bounds and assumptions; the four deliberate fault specs are detected.

This model is in the active harness design.yaml, with executable conformance bindings to gitlab.transport-bounds and gitlab.read-only. Real local HTTP, Git and credential-file fixtures establish request counts, decoding, bytes, headers, target identity and cleanup behavior. The abstraction does not prove TLS, arbitrary remote availability, all credential stores, network-level packet retransmission, a formal refinement or CI/mutation correctness.

Use `covenant design check gitlab-repository-read` and the corresponding `--faults` command for scoped investigation. Finish development with full `pnpm check` after the last tracked change; scoped or stale results cannot establish project completion. The separate models/gitlab candidate manifest still covers unimplemented CI/mutation behavior and intentionally has no invented conformance bindings.
