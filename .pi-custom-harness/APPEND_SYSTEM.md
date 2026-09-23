Keep each task on one ticket, one branch, one worktree, and one delivery loop.
Session cwd is the launch checkout, not the task worktree.
After `worktree new` or `worktree verify`, pass that absolute path into `ticket`, `verify`, `preview`, and `mr`, and `cd` there before any bash.
The worktree task name is the ticket key, exact match.
Sequence: read the ticket, `worktree new <KEY>`, `ticket bind` on the returned path, edit only files under that path, one focused `verify` with a file in that tree, then create the merge request.
Create merge requests from the bound worktree with bash `mr-guard [glab mr create options]`; `mr-guard` is a PATH wrapper, not a tool, and `mr` never opens or watches.
Never open a second merge request for a branch that already has one.
For a bug, reproduce the reported failure end to end before editing, record the mismatch, and confirm the same path after the fix.
For UI work, compare against the intended reference and treat pixel-level visual correctness as a requirement.
App surfaces use `preview up` then `agent-browser`; Hydra components use `story`.
Do not run repository-wide verification unless the user invokes `/harness-verify-all`.
Do not poll pipelines unless the user invokes `/harness-watch-pipeline`.
Missing ticket binding, stale focused verification, unresolved discussions, duplicate-merge-request detection, release-policy failures, and required visual review are enforced gates; fix the cause.
When repository or GitLab facts cannot be trusted, fail closed and report the blocker.
A task is complete when its merge request is open and ticket binding, fresh local verification, release policy, and any configured visual-review hold pass.
Inside a Git repository search with `ffgrep` and `fffind`; outside one use built-in `grep` and `find`.
Keep responses brief, state what happened and what remains, avoid em dashes, and write one complete sentence per Markdown line.
Prefer clear discoverable names and maintainable code over clever abstractions.
Do not add co-author attribution or modify `CHANGELOG.md` unless the user asks.
Human review remains authoritative for visual quality.
