---
name: aircall-merge-train
description: Drive a fast-forward GitLab "merge train" on Aircall repos — merge a set of approved MRs one-by-one (rebase → arm merge-when-pipeline-succeeds → poll → merge), handling approval-resets, Cursor Bugbot gates, rebase conflicts, and flaky E2E retries. Supervised, CI-paced, human-gated. Use after aircall-react-doctor-pipeline produces Ready MRs, or whenever the user asks to "watch and merge" any batch of approved MRs on an Aircall GitLab repo whose merge_method is ff. Repo-agnostic within Aircall (reads merge settings dynamically); not react-doctor-specific.
---

# aircall-merge-train (stage 4 of the react-doctor pipeline, but reusable for any MR batch)

Merges a batch of MRs that are **already approved and Ready**, one at a time, on a repo using **fast-forward merge** (`merge_method=ff`). This is a **supervised main-loop**, NOT a Workflow script: it spans hours (CI-paced) and stops for human decisions. Pace it with `ScheduleWakeup` (~120s) per the `/loop` pattern; report progress to the user (and Slack if asked).

## Why this is a loop, not a workflow
ff + `reset_approvals_on_push` + Bugbot gates + day-long approval latency mean a deterministic background script can't sit and wait or make the judgment calls. Keep it in the main loop where it can DM/ask the user.

## Inputs
- A list of MR iids to merge (e.g. `aircall-react-doctor-pipeline`'s `readyMRs`), or "all open approved MRs matching a branch prefix". (Nothing here is react-doctor-specific — any approved MR batch works.)
- Project (path-encoded for `glab api`, e.g. `aircall%2Fdashboard-extensions%2Fconversation-center-ext`).
- Optional Slack channel/thread for progress, and a DM channel for decisions.

## Setup (once)
1. `glab auth status` — confirm authenticated.
2. Read repo merge settings: `glab api projects/$ENC | jq '{merge_method, only_allow_merge_if_pipeline_succeeds, only_allow_merge_if_all_discussions_are_resolved, reset_approvals_on_push}'`. Confirm ff.
3. Persist a state file (e.g. `.omc/state/mr-merge-train.json`): `{queue, merged, skipped, blocked, needs_approval, current}` so the loop survives compaction/restart.
4. **Parsing note:** MR descriptions often contain raw control chars that break `jq`. Parse `glab api` MR objects with `python3 -c "import sys,json; d=json.loads(sys.stdin.read(),strict=False); ..."`.

## Per-MR procedure (strictly one at a time)
For `current` MR:
1. **Rebase:** `glab api -X PUT projects/$ENC/merge_requests/$mr/rebase`; wait ~13s.
2. **Re-check `detailed_merge_status` (dms):**
   - `need_rebase` (raced — another MR merged) → rebase again.
   - `not_approved` → the rebase changed the diff and `reset_approvals_on_push` cleared approval. Do NOT arm. Move to `needs_approval`, re-queue at END, advance. (Ping the approver if the user wants.)
   - `discussions_not_resolved` → a **Cursor Bugbot** thread (author `project_*_bot_*`) is blocking. Read it; **do not silently resolve High/Medium findings**. Cancel auto-merge (`POST .../cancel_merge_when_pipeline_succeeds`), move to `blocked`, **DM the user** with the finding, advance.
   - `mergeable` / `ci_still_running` → proceed.
3. **Conflict on rebase** (`merge_error: "Rebase failed"`):
   - If it's `doctor.config.json` (or any file the user pre-flagged) → **do NOT skip; DM the user and wait** for instructions.
   - Otherwise → `skipped` + note "needs local rebase", advance. (Optionally spawn a worktree agent to resolve.)
4. **Arm auto-merge:** `glab api -X PUT projects/$ENC/merge_requests/$mr/merge -f merge_when_pipeline_succeeds=true`. If the pipeline is already green it merges immediately.
5. **Poll** every ~120s (`ScheduleWakeup`): when `state==merged` → record, advance to next. If `mwps` dropped to false (fell behind main) → re-rebase + re-arm.
6. **Flaky E2E:** if the pipeline fails on a known-flaky job (e.g. `e2e-509-admin-merge-branch` Playwright timeout) unrelated to the diff → retry that job once (`POST projects/$ENC/jobs/$jid/retry`); leave mwps armed. If it fails again → `skipped` + note "needs attention".
7. **Real CI failure** (e.g. `check-fallow`, `check-ts-compile`) → inspect the job trace; `skipped` + note the cause. Do NOT push code changes to an approved MR autonomously unless the user said so.

## Re-approval pile
Items in `needs_approval` need a human approval that may arrive much later. Each cycle, re-check their approval; when approved, move into the queue (they'll be rebased+armed when they become `current`). Note: re-arming requires a rebase, which may reset approval again if the diff changed — surface that.

## Finish
When the queue is empty and only undecided items remain (blocked on Bugbot / unapproved / needing local fixes):
1. **Stop rescheduling** (do not call `ScheduleWakeup`).
2. Post a final summary (merged / skipped / blocked / needs-approval, with what each needs).
3. If a backlog/status doc exists, tick merged tickets and refresh the tally.
4. **Clean up stale worktrees** for merged/closed branches: verify each via `glab` MR state, then `git worktree remove --force <wt>` + `git worktree prune`. KEEP worktrees for open MRs and active WIP (no MR). Branch refs are preserved.

## Hard-won gotchas (do not relearn)
- ff means every merge invalidates the others' rebase → strictly one at a time.
- `reset_approvals_on_push` fires on a rebase **only when the rebase changes the MR's diff** (overlap with siblings merged ahead). Clean replays keep approval.
- Never auto-resolve Bugbot High/Medium — that's a human call (DM).
- The shell here is **zsh** (the env may report fish): use `for x in a b c; do …; done`, not fish syntax; it does not word-split unquoted vars.
- Slack has no edit-message API exposed — post an updated checklist reply rather than editing.
