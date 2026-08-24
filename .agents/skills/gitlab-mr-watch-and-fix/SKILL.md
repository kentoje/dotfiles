---
name: gitlab-mr-watch-and-fix
description: Watch one open GitLab merge request for new review, Bugbot, security, and pipeline feedback, then apply safe fixes on its existing branch and worktree. Use when asked to watch an MR, monitor a pipeline, fix review comments continuously, or keep an MR green without opening another MR.
---

# GitLab MR Watch and Fix

Monitor one existing MR and apply safe follow-up fixes on that MR's branch.

## Safety rules

- Require an existing MR URL, repository, source branch, and worktree.
- Never create a branch, worktree, or second MR for follow-up work.
- Never merge, force-push, reset, rebase, or rewrite history unless explicitly requested.
- Preserve unrelated user changes. Stop if the worktree is unexpectedly dirty.
- Read every new non-system note and discussion after the baseline. Ignore only feedback proven stale by its referenced commit or resolved thread; inspect stale findings when unsure.
- Treat security findings and high-severity Bugbot findings as blocking.
- Load the repository's required skills and `AGENTS.md` rules before editing.

## Start the watcher first

Do not say “I’m watching” after a one-off API query. Start the bundled read-only watcher with `hub op:start` and report its process name plus the baseline it prints.

Default settings:

- Poll interval: 60 seconds.
- Quiet period: 10 minutes without new feedback or a pipeline transition.
- Override either when the user gives a different interval or quiet period.

From the MR worktree:

```bash
hub op:start \
  name="mr-watch-<IID>" \
  application="python3" \
  args=["/Users/kento/.agents/skills/gitlab-mr-watch-and-fix/scripts/watch-mr-comments.py", \
        "--project", "group%2Fproject", "--iid", "123", \
        "--worktree", "/path/to/worktree", \
        "--interval-seconds", "60", "--quiet-seconds", "600"] \
  ready={"log":"\\\"event\\\": \\"baseline\\\"", "timeout":30}
```

Use `hub op:logs` to read events. The watcher tracks both MR notes and discussion notes, deduplicates note IDs, reports updated feedback, and reports pipeline `(id, SHA, status)` transitions. It is read-only; only the main agent edits, validates, commits, and pushes.

If the watcher cannot start or baseline readiness is not observed, say that monitoring is not active. Do not substitute manual snapshots for a watcher.

## Workflow

1. Verify the existing MR, branch, worktree, and clean worktree state.
2. Start the watcher and capture its baseline: MR head SHA, source branch, worktree, non-system note IDs, discussion note IDs, and pipeline signature.
3. Read watcher events. For new actionable feedback:
   - group duplicates by Bugbot ID or discussion thread;
   - ignore stale feedback only when the cited commit is no longer current and the finding is absent;
   - inspect the cited code and caller path;
   - reproduce with a focused test or real UI surface when applicable;
   - implement the smallest structurally correct fix on the existing branch;
   - add regression coverage for the reported behavior and plausible race/retry/edge cases;
   - run required formatting, type, GraphQL, and focused tests;
   - commit using the repository convention and push to the same branch;
   - after the push is verified, reply on the exact GitLab discussion with the fix commit, changed behavior, and validation evidence, then resolve that discussion;
   - resolve every fixed actionable discussion, including each duplicate thread separately. Do not resolve questions, disagreements, or feedback that was only acknowledged without a verified fix.
4. After every push, verify the new remote SHA and keep the watcher running; it will report the new pipeline transition.
5. Report each fix with Bugbot/thread ID, current commit, exact file/lines, failure mechanism, fix, regression test, verification output, and unresolved risks.
6. Stop only after the requested quiet period. A security-gate success is not actionable feedback, but it remains part of the observed pipeline record.

## Feedback priority

1. Security, secrets, high-severity correctness, and data loss.
2. Medium-severity correctness, race, retry, loading, cache, and accessibility findings.
3. Low-severity correctness and test-quality findings.
4. Style suggestions only when they reduce real complexity.

## Watcher command

The bundled watcher is:

```text
/Users/kento/.agents/skills/gitlab-mr-watch-and-fix/scripts/watch-mr-comments.py
```

Use `--once` only for a deliberate baseline diagnostic. It is not monitoring.
