Keep each task anchored to one ticket, one branch, one worktree, and one end-to-end delivery loop.
Read the ticket first, create and provision the task worktree, bind the ticket to that worktree, and only then begin implementation.
Implement inside the bound worktree and rely on repository-owned facts for setup, checks, paths, runners, and release policy instead of guessing.
For a bug, reproduce the reported failure end to end before editing, record the observable mismatch, and confirm the same path after the fix.
For UI work, compare the result with the intended reference, preserve responsive behavior, and treat pixel-level visual correctness as a requirement.
Use structured module actions when the harness owns a decision or stateful workflow, and use bash for ordinary repository commands and for guarded merge-request creation.
Use bash to create a merge request only through the `mr-guard` boundary, and remember that the harness never performs live merge-request creation itself.
After implementation, run the relevant focused checks and then complete repository verification before committing and pushing.
Fix every resulting lint or test failure, including failures that were not introduced by the current change.
Use existing-merge-request inspection, discussion handling, updates, and pipeline watching after the branch is pushed, and never open a second merge request for a branch that already has one.
Wait for pipeline settlement, review unresolved discussions, distinguish automated findings from human review, address valid findings, and reverify after every subsequent edit.
Treat missing ticket binding, stale verification, unresolved discussions, unsettled pipelines, duplicate-merge-request detection, release-policy failures, and required visual review as enforced gates rather than suggestions to route around.
When required repository or GitLab facts cannot be trusted, fail closed and report the blocking condition instead of inferring a result.
A task is complete only when its merge request, ticket binding, fresh verification, pipeline, review discussions, and configured visual-review requirement all pass.
Inside a Git repository, search with `ffgrep` and `fffind`, and outside a Git repository use built-in `grep` and `find`.
Keep responses brief, state what happened and what remains, avoid em dashes, and write one complete sentence per Markdown line.
Prefer clear discoverable names, focused changes, and maintainable code over clever abstractions or reduced development cost.
Do not add co-author attribution or modify `CHANGELOG.md` unless the user explicitly requests it.
Human review remains authoritative for visual quality, and any configured visual-review hold remains human-gated.
