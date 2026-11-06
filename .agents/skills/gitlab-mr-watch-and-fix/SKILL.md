---
name: gitlab-mr-watch-and-fix
description: Drive one open GitLab merge request to "ready for human review" - pipeline green on the head commit, Qodo / Bugbot / Security Gate / reviewer feedback fixed or answered, draft marked ready - by looping a blocking readiness check and pushing fixes to the MR's existing branch. Use when asked to watch an MR, monitor or babysit a pipeline, fix review or bot comments, keep an MR green, or as the last phase of aircall-dev-flow.
---

# GitLab MR watch and fix

Own one existing MR until it is ready for human review, then report.
"Ready for human review" is decided by `scripts/mr_readiness_check.py`, not by judgement.

## Safety rules

- Require an existing MR, its source branch and its worktree.
  Never create a branch, worktree or second MR for follow-up work.
- Never merge, deploy, force-push, rebase or rewrite history unless the user explicitly asks.
  Merge conflicts are reported as a blocker, with the rebase as the proposed next step.
- Preserve unrelated changes; stop if the worktree is unexpectedly dirty.
- Load the repository's `AGENTS.md` and required skills before editing.
- Committing, pushing fixes, commenting, replying to and resolving threads you fixed, `/agentic_review` and `glab mr update --ready` need no approval.

## Monitoring is real only while the loop runs in your turn

pi, omp, `claude -p` and an agent on a remote machine are not woken by a background process once their turn ends.
So the loop below runs in the foreground, inside your turn, until the verdict is final or a budget runs out.
Never end a turn with "I'm watching" or "I'll keep monitoring": either the loop is running, or you report that monitoring stopped and why.

## The readiness check

```bash
P=aircall%2Fclients%2Fdashboard-v4   # URL-encoded project path
IID=4028
python3 ~/.agents/skills/gitlab-mr-watch-and-fix/scripts/mr_readiness_check.py \
  --project "$P" --iid "$IID" --wait --max-wait-seconds 480
```

- Give the shell call a timeout above 480 seconds (Claude Code: `timeout: 600000`; pi and omp: the bash tool's timeout argument, 600).
- Without `--wait` it is one snapshot.
- It is read-only and prints one JSON verdict; progress lines go to stderr.

| Exit | Verdict | Meaning |
| --- | --- | --- |
| 0 | `ready_for_human_review` | Not draft, head pipeline green, no open bot thread, no unanswered comment, Security Gate not failed, automated review done or timed out. |
| 10 | `action_required` | Do every entry of `actions`, then run the check again. |
| 20 | `pending` | CI or the automated review is still running (`waiting_on`); run it again. |
| 2 | `error` | GitLab API unreachable after retries; see `error`. |

What it knows, so you do not re-derive it:

- The head pipeline must test the current head SHA; merged-results pipelines (`refs/merge-requests/<iid>/merge`) count when the head is a parent of their commit.
  Right after a push the old pipeline is still `head_pipeline`: that is `pending`, not green.
- Failed `allow_failure` jobs do not block; they come back in `warnings`.
  Check whether your change caused them (e.g. a new locale key and `detect-shared-locale-drift`), and fix them if so.
- Qodo (`Code Review by Qodo`, findings posted as badge-only threads) never reviews a draft.
  It reviews when an MR is created non-draft, when it is marked ready, and on an `/agentic_review` comment (about 3 to 6 minutes later), but not after plain pushes.
  Evidence: drafts conversation-center-ext !1368 and !1362 have no Qodo note; dashboard-v4 !4022 got a new review 3 minutes after being marked ready; !3993 got one 6 minutes after `/agentic_review`.
- Cursor Bugbot (`<!-- BUGBOT_REVIEW -->`) and Greptile findings are threads, covered by the thread rule.
- Bots are usernames starting with `service_account_`, `group_<n>_bot_` or `project_<n>_bot_`; GitLab's `bot` flag is empty for them.

## The loop

1. Verify the MR, its source branch, the worktree and a clean `git status`.
2. Run the check with `--wait`.
3. On exit 10, handle each action:

   | Action | Do |
   | --- | --- |
   | `fix_failed_jobs` | Read the job log (`glab ci trace <job id>` or the job's `web_url`), reproduce locally, fix, commit, push. A failure unrelated to the diff that passes locally: retry that job once (`glab ci retry <job id>`); a second failure is a blocker to report. |
   | `address_threads` | Per thread: inspect the cited code, reproduce, fix with a regression test, push, then reply with the fix commit and validation and resolve. A bot finding you decline: reply with the concrete reason, then resolve. A human question or disagreement: reply, do not resolve. |
   | `reply_to_comments` | Read and answer each comment; fix first when it asks for a change. |
   | `fix_security_gate` | Read the newest Security Gate note and fix what it reports. |
   | `request_automated_review` | `glab api -X POST "projects/$P/merge_requests/$IID/notes" -f body=/agentic_review` (once per round of changes). |
   | `mark_ready` | `glab mr update "$IID" --ready`. This also triggers Qodo; the next check waits for it. |
   | `report_blocker` | Stop the loop and report it (conflicts, blocking manual jobs, canceled pipelines). |

4. After every push, confirm the remote SHA (`git ls-remote origin <branch>`) and go back to step 2.
5. On exit 20, go back to step 2.
6. On exit 0, stop and write the final report.

Thread replies and resolves:

```bash
glab api -X POST "projects/$P/merge_requests/$IID/discussions/<discussion_id>/notes" -f body="$(cat /tmp/reply.md)"
glab api -X PUT  "projects/$P/merge_requests/$IID/discussions/<discussion_id>" -f resolved=true
```

Resolve each duplicate thread separately.
Feedback priority: security and data loss, then correctness (races, retries, loading, cache, accessibility), then test quality, then style only when it removes real complexity.

## Budgets and failure handling

- Stop waiting after 3 hours in the loop, or 20 minutes before the machine ends on an mvm machine (the dispatch prompt states the end time; the machine itself does not know it).
- Stop when the same job or finding comes back after 3 fix attempts.
- Exit 2 twice in a row: report GitLab as unreachable.
- When a budget stops the loop, report the last verdict JSON and that monitoring is no longer running.
  A remote session that ends keeps its pushed commits; unpushed work is saved as described in `remote-lambda-microvm-machine`.

## Final report

- MR link, branch, head SHA, draft or ready.
- Pipeline id, status and link; `allow_failure` failures and whether the change caused them.
- Local checks run, with results.
- Automated review state; each finding fixed (commit) or declined (reason).
- `approvals.left` and `approved_by`, threads in `awaiting_reviewer`, warnings, and anything unresolved.
- Never say the MR is ready while the last verdict is not `ready_for_human_review`.
