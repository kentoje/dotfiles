---
name: gitlab-mr-watch-and-fix
description: Watch one open GitLab merge request for new review, Bugbot, security, and pipeline feedback, then apply safe fixes on its existing branch and worktree. Use when asked to watch an MR, monitor a pipeline, fix review comments continuously, or keep an MR green without opening another MR.
---

# GitLab MR Watch and Fix

Monitor one existing MR and apply safe follow-up fixes on that MR's branch.

The watcher is a background process in this session. Do not open a Herdr pane, a terminal split, or any other UI surface to host it. Do not use `hub`.

## Safety rules

- Require an existing MR URL, repository, source branch, and worktree.
- Never create a branch, worktree, or second MR for follow-up work.
- Never merge, force-push, reset, rebase, or rewrite history unless explicitly requested.
- Preserve unrelated user changes. Stop if the worktree is unexpectedly dirty.
- Read every new non-system note and discussion after the baseline. Ignore only feedback proven stale by its referenced commit or resolved thread; inspect stale findings when unsure.
- Treat security findings and unresolved Bugbot findings as blocking.
- Load the repository's required skills and `AGENTS.md` rules before editing.

## Start the watcher in the background

Do not say "I'm watching" after a one-off API query. Start the bundled read-only watcher as a background process and report its pid plus the baseline it prints.

Default poll interval is 60 seconds. There is no quiet period and no time limit. The watcher runs until it is killed.

From the MR worktree, run it in the background so the session can keep reading its output:

```bash
python3 /Users/kento/.agents/skills/gitlab-mr-watch-and-fix/scripts/watch-mr-comments.py \
  --project "group%2Fproject" --iid 123 \
  --worktree /path/to/worktree \
  --interval-seconds 60 \
  > /tmp/mr-watch-<IID>.log 2>&1 &
echo $!
```

Record the pid. Read `/tmp/mr-watch-<IID>.log` for events. The watcher tracks both MR notes and discussion notes, deduplicates note IDs, reports updated feedback, and reports pipeline `(id, SHA, status)` transitions. It is read-only; only the main agent edits, validates, commits, and pushes.

If the process exits before the baseline line is in the log, say that monitoring is not active. Do not substitute manual snapshots for a watcher, and do not move it into a Herdr pane.

## When to kill it

Kill the watcher as soon as both are true:

1. The MR head pipeline status is `success`.
2. Bugbot has no unresolved comment on that head. A Bugbot note is one whose author or body identifies Cursor Bugbot. "Unresolved" means the discussion is still open, or the note is not resolvable and its finding is still present on the current head. A resolved thread, a finding whose cited commit is no longer the head, and a note that only says Bugbot found nothing do not count.

`allow_failure` jobs do not keep the pipeline from being `success`. Do not keep the watcher alive for them unless the user asked for those jobs too.

Do not kill it because a quiet period elapsed, because a security-gate note arrived, or because the pipeline failed. A failed pipeline is more work, not a reason to stop.

Kill only the pid you started:

```bash
kill <pid>
wait <pid> 2>/dev/null || true
```

Confirm the process is gone before reporting that the watch has stopped. If you opened a Herdr pane for an older version of this skill, close that pane too. One watcher per MR.

## Workflow

1. Verify the existing MR, branch, worktree, and clean worktree state.
2. Start the background watcher and capture its baseline: MR head SHA, source branch, worktree, non-system note IDs, discussion note IDs, and pipeline signature.
3. Read the log for new events. For new actionable feedback:
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
6. After each pipeline transition to `success`, re-read the discussions. If Bugbot has no unresolved comment, kill the watcher and say so. Otherwise keep watching and fix those comments.

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
