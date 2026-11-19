# GitLab acceptance implementation plan

Repository-read obligations GITLAB-001/003/018/019 have real native bindings. All 19 GitLab obligations now have executable bindings. implementation-plan.yml distinguishes implemented checks from remaining reserved IDs; brick-design.md describes the complete planned surface. scenarios.yml provides concrete cases; generic prior obligation-review records remain planning aids, not executable evidence.

Acceptance covers target/auth/transport, repository and CI reads, bounded logs, shared MR lookup, pipeline mutations and Pi registration. Tests must observe actual request methods, paths, host/project/pipeline IDs, request counts, cancellation and output bounds against local service/process fixtures. Each obligation activates only after its own test binding exists and passes; do not reuse another module's green tests as GitLab evidence.

Deliberately challenge changed/ambiguous targets; approval flags; unsafe redirects; unknown/malformed write responses; partial pagination; no-op from incomplete job scans; asynchronous cancellation; split credential/UTF-8 windows; oversized JSON; conflicting writes and all forbidden actions. The isolated real Pi SDK test must preserve built-ins and register only the implemented GitLab actions. Live auth/version probes may be read-only and explicitly reported; real retry/cancel requires a task asking for those exact effects.

The three GitLab models in design.yaml have executable conformance bindings. The mutation and collection candidates were checked before implementation. Recheck all models, deliberate faults and implementation bindings using pnpm check after the final input change.

After implementation, run full pnpm check after the final input change, inspect exact obligation outcomes, and update the tracker with verified backend/server/credential scope. A model pass is neither a GitLab implementation nor proof of HTTP, parser, secret-redaction or distributed behavior.
