---
name: aircall-dev-flow
description: >
  Kento's per-ticket loop, owned end to end: Jira ticket → worktree → implement →
  verify → commit, push and open a draft MR → drive it to "ready for human review"
  (pipeline green, Qodo / Bugbot / reviewer feedback fixed) → report. No approval
  gate before committing or opening the draft unless the user asks for one; never
  merges or deploys. Use when the user wants to start or continue work on a
  ticket, feature or fix that should end in a GitLab MR, "take this from ticket to
  MR", or runs a task on a remote machine.
---

# Aircall dev flow

You own the task until its MR is ready for human review, then you report.
The user should not have to steer you between the request and that report.
Each phase hands off to the skill that already does the work; this file only sequences them.

## Ownership contract

- Run every phase without asking: committing, pushing, opening a draft MR, fixing checks and bot findings, `/agentic_review`, marking the MR ready.
- Stop and ask only when:
  - the scope or the ticket's epic is genuinely ambiguous;
  - the user, the dispatch prompt or the repository asks for a review stop ("stop before pushing", "don't open the MR"): then stop after phase 4 and report;
  - an action is destructive or irreversible: force-push, rebase, history rewrite, deleting branches or data;
  - a blocker you cannot fix (permissions, missing tooling, a red job unrelated to the change after one retry).
- Never merge or deploy without the user's explicit approval.
- Project rules win: the repository's `AGENTS.md`, its required checks and skills override this file.
  Use repository-specific modes such as poteto-mode only when that repository's instructions or the user ask for them.

## One MR, one branch

Follow-up work on a ticket that has an MR happens on that MR's branch and worktree.
Never cut a new branch or open a second MR for it: a review comment, a red pipeline or a missed edge case is a commit pushed to the existing branch.

## Phases

### 1. Ticket

- A Jira key or URL given: read it (`jira issue view <KEY>`).
- "No ticket" said explicitly: skip.
- Otherwise create one with the `jira` skill (Create a CI ticket) before any branch, worktree or source change.
  A ticket the dispatch prompt says already exists is not created again.

### 2. Worktree

Check for work in flight first:

```bash
git worktree list | grep -i <TICKET>
glab mr list --search <TICKET>
```

A hit: continue on that MR's branch, in its worktree (create the worktree from that branch if it is missing), after reading `git status` and the MR's state.
No hit: create the worktree with the repository's own script or skill when it has one (`scripts/new-worktree.sh` in conversation-center-ext, which also provisions `.env.local`, `PORT`, `node_modules` and `src/graphql-env.d.ts`; run `scripts/setup-worktree.sh <path>` on a worktree made any other way).
Otherwise `git worktree add` from the up-to-date default branch.
Branches follow `<area>/<TICKET>-<slug>`.

### 3. Implement

- Read the ticket, linked specs and the repository's `AGENTS.md`.
- While iterating, run checks on the changed files only (the file's lint, its focused tests).
- When the change has UI impact, verify it on the surface that ships, not a playground or storybook rendering of it: reach the real route, and find the data or query string that makes the change visible.
  The dev server and browser differ by machine: on the laptop, `portless run` in the background, `portless get <project>` for its stable `.localhost` URL, and the `agent-browser-aircall-local` skill; on an mvm machine, the Dev server section of `remote-lambda-microvm-machine`.

### 4. Local readiness

- Review your own diff (`git diff <default branch>...HEAD`): scope, leftovers, debug code, comments, tests for the behaviour.
- Run every check the repository's `AGENTS.md` requires (dashboard-v4: `pnpm ts:check` after TypeScript changes) and fix every failure on this branch.
- If a review stop was requested, stop here: report changes, worktree, branch and check results.

### 5. Draft MR

Commit (repository convention, ticket key), push, and open a **draft** MR with the `gitlab-create-merge-request` skill.
Open it as soon as there is a coherent implementation worth reviewing: CI starts early, and the MR is the place later fixes land.

### 6. Drive the MR to ready for human review

Follow the `gitlab-mr-watch-and-fix` skill: it loops `mr_readiness_check.py --wait` inside your turn, fixes failed jobs and findings, requests Qodo with `/agentic_review` (Qodo skips drafts), marks the MR ready once the draft is clean, and waits for the review that triggers.
Its final report is your final report.
Do not report the MR as ready while the check's verdict is anything but `ready_for_human_review`.

### 7. Merge (only on explicit request)

Hand the exact MR URLs to the `aircall-merge-train` skill.
