# GitLab candidate design

CI/mutation implementation is pending; the independent repository-read slice is implemented and modeled under models/gitlab-read. These models are declared in design-proposal.yaml and deliberately absent from the active harness design.yaml until real conformance bindings exist. The existing CLI rejects mixed complete/pending implementation conformance; it must not be made green with invented GitLab tests. This limitation is recorded in ADR-010.

Mutation.tla explores target/authority binding, one mutation send, stop-before-send, unknown delivery, canceled-state observation and complete-evidence no-op. Reads.tla explores absence from complete collection evidence. Bounds and assumptions are explicit in the manifest. Eight fault models challenge wrong target, duplicate write, dispatch after stop, lost write reported as success, acceptance treated as confirmation, partial-scan no-op, partial-scan absence and failed-scan absence. No liveness, distributed coordination, arbitrary page counts, HTTP authentication, byte-parser or redaction proof is claimed.

## Reproduce the native Covenant review

From the harness checkout, with installed dependencies and a compatible local Covenant binary:

```sh
proposal_dir="$PWD/.covenant/design-proposals/gitlab/$(date +%s)-$$/project"
mkdir -p "$proposal_dir"
cp -R contracts architecture src models tools commands capabilities docs scripts vendor bin \
  README.md AGENTS.md package.json pnpm-lock.yaml covenant.yaml .fallowrc.json \
  tsconfig.json vitest.config.ts oxlint.config.ts oxfmt.config.ts "$proposal_dir/"
cp models/gitlab/design-proposal.yaml "$proposal_dir/design.yaml"
ln -s "$PWD/node_modules" "$proposal_dir/node_modules"
.covenant/bin/covenant --project "$proposal_dir" --json design validate
.covenant/bin/covenant --project "$proposal_dir" --json design check
.covenant/bin/covenant --project "$proposal_dir" --json design check --faults
.covenant/bin/covenant --project "$proposal_dir" --json design status
.covenant/bin/covenant --project "$proposal_dir" --json design conformance
```

The last command must reject conformance with exit 4 and `implementation pending`. That is the intended lifecycle distinction, not a passing implementation result. All model invariants and declared faults must pass their own checks first. Unknown/error/timeout/incomplete results are never accepted. Snapshots and native receipts append under .covenant/design-proposals; preserve earlier evidence. The snapshot shares only installed checker dependencies, not live credentials or mutable target projects.

Recreate the snapshot after any relevant model/configuration/contract/schema/toolchain change. Native receipts carry input hashes, checker identity/version, bounds, assumptions and completeness for that snapshot; `design status` verifies snapshot freshness. A passing archived snapshot does not certify changed working-tree inputs. Model actions/observations and exact planned acceptance IDs are specified in contracts/gitlab/brick-design.md; bind them to real checks when implementation begins.

Recorded model scope for this design pass (2026-11-12): Mutation exhausted 138 states with all six invariants, Reads exhausted 36 states with HonestAbsence, and all eight declared faults were detected. The native conformance command correctly rejected the proposal as implementation pending. The checker was tla-ts 0.0.7 through @covenant/model-checker 0.1.0. Reproduce and inspect fresh receipts rather than treating these counts as freshness evidence.
