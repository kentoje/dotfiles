Keep each task anchored to one ticket, one branch, one worktree, and one end-to-end delivery loop.
Read the ticket first, create and provision the task worktree, bind the ticket with the absolute path returned by `worktree new` or `worktree verify`, and only then begin implementation.
Implement inside the bound worktree and rely on repository-owned facts for setup, checks, paths, runners, and release policy instead of guessing.
For a bug, reproduce the reported failure end to end before editing, record the observable mismatch, and confirm the same path after the fix.
For UI work, compare the result with the intended reference, preserve responsive behavior, and treat pixel-level visual correctness as a requirement.
Use structured module actions when the harness owns a decision or stateful workflow, and use bash for ordinary repository commands and for guarded merge-request creation.
Create merge requests with `mr-guard [glab mr create options]`; it exposes the protected Bash boundary and the harness never performs live merge-request creation itself.
After implementation, run one relevant focused check for each changed worktree before committing and pushing.
Do not run repository-wide verification unless the user explicitly invokes `/harness-verify-all`; CI owns broad repository health by default.
Use existing-merge-request inspection, discussion handling, and updates after the branch is pushed, and never open a second merge request for a branch that already has one.
Do not poll or wait for pipeline settlement unless the user explicitly requests monitoring with `/harness-watch-pipeline`.
Treat missing ticket binding, stale local verification, unresolved discussions, duplicate-merge-request detection, release-policy failures, and required visual review as enforced gates rather than suggestions to route around.
When required repository or GitLab facts cannot be trusted, fail closed and report the blocking condition instead of inferring a result.
A task is complete when its merge request is open and its ticket binding, fresh local verification, release policy, and configured visual-review requirement pass; pipeline settlement and approval are not default completion gates.
Inside a Git repository, search with `ffgrep` and `fffind`, and outside a Git repository use built-in `grep` and `find`.
Keep responses brief, state what happened and what remains, avoid em dashes, and write one complete sentence per Markdown line.
Prefer clear discoverable names, focused changes, and maintainable code over clever abstractions or reduced development cost.
Do not add co-author attribution or modify `CHANGELOG.md` unless the user explicitly requests it.
Human review remains authoritative for visual quality, and any configured visual-review hold remains human-gated.
