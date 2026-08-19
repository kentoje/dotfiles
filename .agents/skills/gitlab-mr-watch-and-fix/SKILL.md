---
name: gitlab-mr-watch-and-fix
description: Watch an open GitLab merge request for new Bugbot, review, pipeline, or security comments, then inspect, fix, verify, commit, and push follow-ups on the MR's existing branch and worktree. Use when asked to watch an MR, fix review comments continuously, monitor Bugbot feedback, or keep a GitLab MR green without opening a second MR.
---

# GitLab MR Watch and Fix

Continuously monitor one existing MR and apply safe follow-up fixes on its existing branch.

## Safety rules

- Require an existing MR URL, repository, branch, and worktree.
- Never create a new branch, worktree, or MR for follow-up work.
- Never merge, force-push, reset, rebase, or rewrite history unless explicitly requested.
- Read every new non-system note and discussion after the baseline. Ignore stale notes from older commits, but inspect whether their finding is still present.
- Treat security findings and high-severity Bugbot findings as blocking.
- Preserve unrelated user changes. Stop if the worktree contains unexpected edits.
- Use the repository's required skills and `AGENTS.md` rules before editing.

## Workflow

1. Capture the MR baseline: current head SHA, source branch, worktree, and latest non-system note ID.
2. Poll notes and discussions at the requested interval. Record the latest SHA after each push.
3. For new actionable feedback:
   - group duplicate/stale reports by Bugbot ID or discussion thread;
   - inspect the cited code and caller path;
   - reproduce with a focused test or the real UI surface when applicable;
   - implement the smallest structurally correct fix on the existing branch;
   - add regression coverage for the reported behavior and plausible retry/race/edge cases;
   - run required formatting, type, GraphQL, and focused tests;
   - commit using the repository convention and push to the same branch.
4. Report each fix with commit SHA, verification output, and unresolved risks.
5. Stop after the requested quiet period with no new actionable comments. A security-gate success is not an actionable review comment.

## Comment handling

Prioritize, in order:

1. Security, secrets, high-severity correctness, and data-loss findings.
2. Medium-severity correctness, race, retry, loading, cache, and accessibility findings.
3. Low-severity correctness and test-quality findings.
4. Style-only suggestions only when they reduce real complexity.

For each finding, state:

- Bugbot/thread ID and current commit.
- Exact file and line range.
- Failure mechanism.
- Fix and regression test.
- Verification result.

## Polling example

```bash
MR='https://gitlab.com/group/project/-/merge_requests/123'
PROJECT='group%2Fproject'
IID=123

glab api "projects/$PROJECT/merge_requests/$IID/notes?per_page=100"
glab api "projects/$PROJECT/merge_requests/$IID/discussions?per_page=100"
```

Use a supervised long-running process for polling. Keep the watcher read-only; only the main agent edits, validates, commits, and pushes fixes.
