---
name: aircall-dev-flow
description: >
  Orchestrates Kento's per-ticket dev loop end-to-end: optional Jira ticket →
  create/reuse a git worktree → implement → debug in the browser → commit, push,
  open the MR → optionally watch the pipeline. Runs autonomously through setup
  and implementation, then STOPS at a readiness gate before shipping. Use when
  the user wants to start work on a ticket/feature/fix, "spin up a worktree and
  implement", "take this from ticket to MR", or kick off the dev flow. Delegates
  each step to existing skills — it does not reimplement them.
---

# Aircall Dev Flow

One orchestrator for the whole loop. It is **glue + sequencing**, not new behaviour:
each step hands off to the dedicated skill/tool that already does it. Your job is
to drive the sequence, make the optional-branch decisions, and **respect the gate**.

## Autonomy contract — "auto until the first gate"

Run **phases 1–4 autonomously** (ticket → worktree → implement → debug). Do **not**
ask for permission between them. Then **STOP at the gate** (phase 5) and ask the
user _"is it good?"_ before any commit/push/MR. Never cross the gate on your own.

## Flow manifest (state — write at every phase)

Each worktree carries a `.dev-flow.json` manifest so the flow is **resumable** (after
`/clear`/`/resume`), **visible across parallel sessions**, and feeds the merge-train.
Update it with the bundled helper after every phase transition — never hand-write the JSON:

```bash
scripts/dev-flow-set.py phase=implementing
scripts/dev-flow-set.py ticket.key=CI-5814 ticket.epic=csat ticket.storyPoints=3
scripts/dev-flow-set.py slug=CI-5814-friendlypopup branch=react-doctor/CI-5814-friendlypopup repo=aircall/dashboard-extensions/conversation-center-ext
scripts/dev-flow-set.py gate.approved=true gate.verdict="ship it"
scripts/dev-flow-set.py mr.id=1070 mr.url=<MR_URL>
scripts/dev-flow-set.py pipeline.status=failed
```

`phase` vocabulary (in order): `scoped → worktree → implementing → debugging → gated → approved → shipped → watching → done`.

**On resume:** if `.dev-flow.json` exists in the worktree, read it first and continue from `phase` instead of restarting. The board view across all worktrees/repos:

```bash
scripts/dev-flow-status.py            # set DEV_FLOW_ROOTS to scan all repos (aliased to `dfs`)
scripts/dev-flow-status.py --ready    # gate-approved + green MR URLs (one per line, pipeable)
scripts/dev-flow-status.py --merge    # same set, printed as a ready-to-run merge-train instruction
```

> Keep `.dev-flow.json` out of commits (it's local state) — add it to the repo's `.git/info/exclude` or your global gitignore.

## Phases

**After each phase below, record it in the manifest** with `dev-flow-set.py` (the field to set is noted per phase).

### 1. Ticket (optional — skip if the user already has one or says no)

- If the user gives a Jira key/URL: read it with the `jira` skill (`jira issue view <KEY>`) to scope the work.
- If they want a _new_ ticket, create it and **always set these four fields** (Kento specifies them every time):
  1. **Sprint** — the **current/active** sprint (project `CI`, board `4795`). ⚠️ The `jira` CLI **cannot** assign sprints here: it's configured for board `1260`, whose sprint endpoint 404s, so every `jira sprint list` variant fails. Get the active sprint from the REST agile API and create the issue via REST — see below.
  2. **Assignee** — **Kento Monthubert** (account id `61623175d9820f0070f2d020`; or `jira me`). Always self-assigned.
  3. **Epic** — link it to the **relevant epic** (e.g. csat, scorecard-template). Ask which if not obvious.
  4. **Story points** — always set them; ask for the estimate if the user didn't give one.
- Two disciplines, every time:
  - **Dedup first** — check the epic for an existing ticket before creating, so you don't duplicate.
  - **Batch gate** — when creating several, create **one** first, then **wait for the user's "go"** before the rest.
- Capture the ticket key — it names the branch and seeds the MR title.
- → manifest: `dev-flow-set.py phase=scoped ticket.key=<KEY> ticket.epic=<EPIC> ticket.storyPoints=<N>`

> **Creating the ticket (REST recipe — the CLI can't do sprints):** token is in the `$JIRA_API_TOKEN` env var (not the keychain).
> 1. Active sprint: `curl -u "$USER_EMAIL:$JIRA_API_TOKEN" "https://aircall-product.atlassian.net/rest/agile/1.0/board/4795/sprint?state=active"` → sprint id (e.g. `21043`).
> 2. `POST https://aircall-product.atlassian.net/rest/api/2/issue` with `fields`: `project.key="CI"`, `issuetype.id="10002"` (Task), `assignee.id="61623175d9820f0070f2d020"`, `customfield_10014`=epic key (Epic Link), `customfield_10020`=sprint id (int), `customfield_10028`=story points (the CI create-screen field, **not** `customfield_10016`), `description` in wiki markup (`h2.`, `{{code}}`).
> 3. Verify: `GET /rest/api/2/issue/<KEY>?fields=summary,assignee,customfield_10014,customfield_10020,customfield_10028,status`.
> 4. Dedup first: `jira issue list -q "project = CI AND summary ~ '<term>'"`. The `jira` CLI is still fine for **reading** (`jira issue view <KEY>`), just not for sprint-assigned creation.

### 2. Worktree (create or reuse)

Prefer, in this order:

1. **A repo-local worktree-setup skill/script** if the repo has one (look for a skill named like `<repo>-worktree`, a `scripts/worktree*`/`bin/wt*`, or a `Makefile`/`package.json` setup target). Use it — it handles env/install bootstrapping.
2. **Reuse an existing worktree** if one already matches this ticket/MR (check `git worktree list` and `<repo>/.claude-worktrees/`). Branches follow `<area>/<TICKET>-<slug>` (e.g. `react-doctor/CI-5814-friendlypopup-transform`).
3. **Native worktree** otherwise — create one named for the ticket.

Then make that worktree the working directory for everything below — and write the manifest **there** (`--file <worktree>/.dev-flow.json`, the default once you `cd` in).

- → manifest: `dev-flow-set.py phase=worktree slug=<SLUG> branch=<BRANCH> repo=<owner/repo>`

### 3. Implement

Do the actual work in the worktree. Read the ticket + any linked spec; if there's
an MR already, read **Cursor's bot comments** and the failing checks. This is normal
agent work — no sub-skill.

- → manifest: `dev-flow-set.py phase=implementing`

### 4. Debug (when UI verification is needed)

**Start the dev server with `portless`** — never a bare port. The proxy runs as a
service (already `portless service install`-ed), so there's nothing to start first.
From the worktree, run the repo's dev script through the proxy: portless gives each
worktree a **stable `.localhost` URL** (the branch name becomes a subdomain, so
parallel tickets never collide on ports or cookies).

```bash
portless run                   # runs the repo's `dev` script through the proxy — run it in the background (long-lived)
URL=$(portless get <project>)  # -> https://<branch>.<project>.localhost (worktree prefix auto-applied)
```

`<project>` is portless's inferred name (the `package.json` name / repo dir); if
unsure, `portless list` shows the active route. Wait until it's actually serving,
then hand `$URL` to the **`agent-browser-aircall-local`** skill (it auto-authenticates;
always `--session aircall-local`) to load it, snapshot, and verify the change
renders/behaves correctly. Iterate against it until the behaviour is right.

- → manifest: `dev-flow-set.py phase=debugging`

### 5. ⛔ GATE — "is it good?"

**STOP.** Summarise what changed and what you verified, then ask the user to confirm
before shipping. Do not commit, push, or open an MR until they say go.

- → manifest, on reaching the gate: `dev-flow-set.py phase=gated`
- → manifest, once the user says go: `dev-flow-set.py phase=approved gate.approved=true gate.verdict="<their words>"`

### 6. Ship (only after the gate clears)

- Commit and push the branch.
- Open the MR via the **`gitlab-create-merge-request`** skill (first commit message
  becomes the title, targets `main`, `--fill -y`). Reference the ticket key.
- → manifest: `dev-flow-set.py phase=shipped mr.id=<ID> mr.url=<MR_URL>`

### 7. Watch the pipeline (optional — only if the user asks to "spy on the pipeline")

Run the bundled poller against the MR's branch:

```bash
scripts/watch-pipeline.sh            # current branch
scripts/watch-pipeline.sh -b <branch> -R <owner/repo>
```

It polls `glab ci get` until the pipeline reaches a terminal state and prints
failing jobs if it fails. See [scripts/watch-pipeline.sh](scripts/watch-pipeline.sh).

- → manifest: `dev-flow-set.py phase=watching`, then record the terminal result —
  `dev-flow-set.py pipeline.status=success phase=done` (or `pipeline.status=failed`, looping back to phase 3).

### 8. Merge (handoff — only when the user asks to merge the ready batch)

When the user says "merge the ready ones" (or similar): run `dev-flow-status.py --ready`
to collect the gate-approved + green MR URLs, then **invoke the `aircall-merge-train`
skill** on exactly those URLs. As each MR merges, mark it `dev-flow-set.py phase=done`
in its worktree. Never reimplement merging here — `--merge` only emits the handoff;
`aircall-merge-train` (supervised, human-gated) does the actual work.

> Two entry points, same handoff: the **script** `dev-flow-status.py --merge` just
> _prints_ the prompt (for the in-session skill path and for piping). The **`dfs` fish
> wrapper**, when run interactively (`dfs --merge` in a real terminal), instead
> _launches a supervised `claude` session_ seeded with that prompt — so you watch it
> drive the train and answer the gates. It deliberately does **not** use `claude -p`
> (headless), since merge-train is human-gated and merges to `main`. Piped/non-tty
> `dfs --merge` falls back to printing. Launcher is overridable via `DEV_FLOW_CLAUDE`.

## Notes

- This skill **delegates** — never reinvent ticket/MR/browser steps; call the skills above.
- Bundled code is only glue: `dev-flow-set.py` / `dev-flow-status.py` (manifest) and `watch-pipeline.sh`. Everything else is native worktree, `jira`, `agent-browser-aircall-local`, and `gitlab-create-merge-request`.
- For merging the approved MR afterwards, hand off to the `aircall-merge-train` skill.
