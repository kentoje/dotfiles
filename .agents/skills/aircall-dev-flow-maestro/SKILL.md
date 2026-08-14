---
name: aircall-dev-flow-maestro
description: >
  The per-ticket dev loop for work that maestro owns: ticket → worktree →
  implement → debug → gate → MR, with a maestro ownership check before any
  worktree is created and `maestro adopt` after the MR exists. Use when the
  ticket is already a maestro task, when a virtuoso may be live on it, or when
  the work should stay reachable by `maestro resume` later. For a one-off ticket
  in this session with no maestro involvement, use `aircall-dev-flow` instead.
---

# Aircall Dev Flow (maestro-owned)

Same loop as [`aircall-dev-flow`](../aircall-dev-flow/SKILL.md), with maestro as the
system of record for who owns a branch, a worktree and an MR. It is **glue +
sequencing**, not new behaviour: each step hands off to the dedicated skill/tool that
already does it. Your job is to drive the sequence, make the optional-branch decisions,
and **respect the gate**.

Pick this skill over the plain one when maestro is (or should be) tracking the work.
The differences are the ownership check in phase 2, `maestro adopt` in phase 6, and asking maestro
for the dev URL in phase 4; everything else is identical, and the shared rules live in the sibling.

> **`dev-flow-set` is not a command.** It is a script at that exact path, on nobody's PATH,
> under no shorter name. Write the path in full every time - and if you ever ask another
> agent to record a phase, give it that path, because a dispatched virtuoso is sandboxed,
> cannot see this skill, and cannot resolve "the shared dev-flow-set helper": one spent
> four minutes globbing two home roots for it and then hand-wrote the JSON this skill
> forbids hand-writing (see maestro's docs/postmortem-ci-6569-user-column.md, finding 6).
>
> **The bundled scripts are not duplicated.** All three live in the sibling skill and are
> referenced from there, always as `~/.agents/skills/aircall-dev-flow/scripts/`. The path is
> written home-anchored rather than skill-relative on purpose: phase 2 makes the *worktree*
> the working directory for everything below, so a `../aircall-dev-flow/…` path would resolve
> next to the worktree and every manifest write would fail. `~/.claude/skills/…` is the same
> tree if you prefer it.

## One MR, one branch - follow-up work never forks

Follow-up work on an MR that already exists happens on **that MR's own branch, in that MR's own worktree**.
Never cut a new branch, and never open a second MR, for a ticket that already has one.
A review comment, a red pipeline, a broken test, a missed edge case: each is a commit pushed to the existing branch, which updates the open MR automatically.
Two steps enforce this: the ownership check in phase 2 (before any worktree is created) and `maestro adopt` in phase 6 (which keeps the work reachable afterwards).

## Autonomy contract — "auto until the first gate"

Run **phases 1–4 autonomously** (ticket → worktree → implement → debug). Do **not**
ask for permission between them. Then **STOP at the gate** (phase 5) and ask the
user _"is it good?"_ before any commit/push/MR. Never cross the gate on your own.

## Flow manifest (state — write at every phase)

Each worktree carries a `.dev-flow.json` manifest so the flow is **resumable** (after
`/clear`/`/resume`), **visible across parallel sessions**, and feeds the merge-train.
Update it with the shared helper after every phase transition — never hand-write the JSON:

```bash
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=implementing
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py ticket.key=CI-5814 ticket.epic=csat ticket.storyPoints=3
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py slug=CI-5814-friendlypopup branch=react-doctor/CI-5814-friendlypopup repo=aircall/dashboard-extensions/conversation-center-ext
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py gate.approved=true gate.verdict="ship it"
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py mr.id=1070 mr.url=<MR_URL>
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py pipeline.status=failed
```

`phase` vocabulary (in order): `scoped → worktree → implementing → debugging → gated → approved → shipped → watching → done`.

**On resume:** if `.dev-flow.json` exists in the worktree, read it first and continue from `phase` instead of restarting. The board view across all worktrees/repos:

```bash
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-status.py            # set DEV_FLOW_ROOTS to scan all repos (aliased to `dfs`)
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-status.py --ready    # gate-approved + green MR URLs (one per line, pipeable)
~/.agents/skills/aircall-dev-flow/scripts/dev-flow-status.py --merge    # same set, printed as a ready-to-run merge-train instruction
```

> Keep `.dev-flow.json` out of commits (it's local state) — add it to the repo's `.git/info/exclude` or your global gitignore.

## Phases

**After each phase below, record it in the manifest** with `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py` (the field to set is noted per phase).

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
- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=scoped ticket.key=<KEY> ticket.epic=<EPIC> ticket.storyPoints=<N>`

> **Creating the ticket (REST recipe — the CLI can't do sprints):** token is in the `$JIRA_API_TOKEN` env var (not the keychain).
> Auth for ALL THREE steps below is `-u "$(jira me):$JIRA_API_TOKEN"` — the email comes from `jira me`,
> **not** from `$USER_EMAIL`, which is unset in most
> shells here (`jira me` is a local config read, ~20ms, so calling it per curl costs nothing).
> Basic auth with an empty username returns `401`, which reads exactly like an expired
> token: that misdiagnosis stopped a ticket being created and reported "refresh your token" to the
> user, when the token was fine (maestro docs/postmortem-ci-6569-user-column.md).
> 1. Active sprint: `curl -u "$(jira me):$JIRA_API_TOKEN" "https://aircall-product.atlassian.net/rest/agile/1.0/board/4795/sprint?state=active"` → sprint id (e.g. `21043`).
> 2. `POST https://aircall-product.atlassian.net/rest/api/2/issue` with `fields`: `project.key="CI"`, `issuetype.id="10002"` (Task), `assignee.id="61623175d9820f0070f2d020"`, `customfield_10014`=epic key (Epic Link), `customfield_10020`=sprint id (int), `customfield_10028`=story points (the CI create-screen field, **not** `customfield_10016`), `description` in wiki markup (`h2.`, `{{code}}`).
> 3. Verify: `GET /rest/api/2/issue/<KEY>?fields=summary,assignee,customfield_10014,customfield_10020,customfield_10028,status`.
> 4. Dedup first: `jira issue list -q "project = CI AND summary ~ '<term>'"`. The `jira` CLI is still fine for **reading** (`jira issue view <KEY>`), just not for sprint-assigned creation.

### 2. Worktree (create or reuse)

**First, ask whether this ticket is already in flight - before creating anything.**

```bash
maestro ls | grep -i <TICKET>
```

A matching row means a maestro task already owns this ticket's branch, worktree and MR.
In that case **do not create a worktree and do not cut a branch**: stop, and tell the user to continue the existing work, naming the task id from the `TASK` column and the MR from the `MR` column.
Which verb to hand them depends on the `WORKSPACE` column:

- a workspace id → a virtuoso is live on it: `maestro send --task <id> --message "…"`
- `-` → no live session: `maestro resume --task <id> --message "…"`

Both continue on the existing branch and push to the existing MR, which is the whole point.
Only when the grep comes back empty do you continue below.

Then prefer, in this order:

1. **A repo-local worktree-setup skill/script** if the repo has one (look for a skill named like `<repo>-worktree`, a `scripts/worktree*`/`scripts/new-worktree*`/`bin/wt*`, or a `Makefile`/`package.json` setup target). Use it — it handles env/install bootstrapping. **Check for this first, before reaching for native `git worktree add`.**
2. **Reuse an existing worktree** if one already matches this ticket/MR (check `git worktree list` and `<repo>/.claude-worktrees/`). Branches follow `<area>/<TICKET>-<slug>` (e.g. `react-doctor/CI-5814-friendlypopup-transform`).
3. **Native worktree** otherwise — create one named for the ticket, **then provision it explicitly** (see the ⚠️ box).

> **⚠️ conversation-center-ext (dashboard-extensions/conversation-center-ext) — always provision, never bare.**
> This repo carries `scripts/new-worktree.sh` and `scripts/setup-worktree.sh`. Provisioning copies gitignored-but-required files that `git worktree add` does **not** bring: `.env.local` (+ a unique `PORT`), `.claude/settings.local.json`, a `node_modules` symlink (or background `pnpm install` when lockfiles differ), and `src/graphql-env.d.ts` (gql-tada output — without it tsc/biome emit a flood of false `never` errors).
> - **Create via the script:** `scripts/new-worktree.sh <name> [branch] [base]` (lands under `.claude/worktrees/<name>` and auto-provisions).
> - **If a worktree was created any other way** — bare `git worktree add`, the Agent tool's `isolation: worktree`, or `maestro dispatch` — run the provisioner on it explicitly, idempotently: `bash <repo>/scripts/setup-worktree.sh <worktree-path>`.
> - **Why you can't rely on the hook:** `setup-worktree.sh` is wired as a PostToolUse hook in the *repo's* `.claude/settings.json`. It only fires for sessions whose project root **is** that repo. From a maestro session (project root `/Volumes/HomeX/kento`) or any out-of-repo session, the hook never loads — so provisioning must be run by hand. Symptom of skipping it: missing `.env.local`, or a wall of GraphQL `never`-type errors.

Then make that worktree the working directory for everything below — and write the manifest **there** (`--file <worktree>/.dev-flow.json`, the default once you `cd` in).

- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=worktree slug=<SLUG> branch=<BRANCH> repo=<owner/repo>`

### 3. Implement

Do the actual work in the worktree. Read the ticket + any linked spec; if there's
an MR already, read **Cursor's bot comments** and the failing checks. This is normal
agent work — no sub-skill.

- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=implementing`

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

**When maestro owns the task, ask maestro instead:**

```bash
URL=$(maestro dev-url --task <id>) || URL=""     # `unknown command "dev-url"` => this
[ -n "$URL" ] || URL=$(portless get <project>)   # maestro predates it; fall back above
```

It starts the server if nothing is serving, prints the URL alone, and exits non-zero rather
than answer for a server that did not start. Worth asking for because portless names the
subdomain from the git BRANCH, not the task, so there is no formula to guess. The fallback
matters: an unknown subcommand is invisible to `command -v maestro`, and an unguarded
`$(…)` would leave `$URL` empty and hand the browser nothing - which reads exactly like the
change not being there.

Its last resort IS a guess (`<task>.<package>.localhost`) and can be wrong when the branch
drives the subdomain. If the page 404s, check `portless list` before concluding anything
about your change.

`<project>` is portless's inferred name (the `package.json` name / repo dir); if
unsure, `portless list` shows the active route. Wait until it's actually serving,
then hand `$URL` to the **`agent-browser-aircall-local`** skill (it auto-authenticates;
always `--session aircall-local`) to load it, snapshot, and verify the change
renders/behaves correctly. Iterate against it until the behaviour is right.

**Verify the surface that ships, not a rehearsal of it** - see `aircall-dev-flow`, which owns this rule.

- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=debugging`

### 5. ⛔ GATE — "is it good?"

**STOP.** Summarise what changed and what you verified, then ask the user to confirm
before shipping. Do not commit, push, or open an MR until they say go.

- → manifest, on reaching the gate: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=gated`
- → manifest, once the user says go: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=approved gate.approved=true gate.verdict="<their words>"`

### 6. Ship (only after the gate clears)

- Commit and push the branch.
- Open the MR via the **`gitlab-create-merge-request`** skill (first commit message
  becomes the title, targets `main`, `--fill -y`). Reference the ticket key.
- **Register the work with maestro, so a follow-up can reach this MR instead of forking a new one:**

  ```bash
  maestro adopt --repo <repo-path> --task <slug> --ticket <TICKET> \
    --branch <branch> --worktree <worktree-path> --mr <MR_URL>
  ```

  `adopt` only records what you just created - it never cuts a branch, adds a worktree, or opens an MR.
  Skipping it is what leaves a ticket unreachable: with no task record, the only verb left later is `maestro dispatch`, which cuts a second branch and opens a duplicate MR for work that already has one.
  Once adopted, the next round on this MR is `maestro resume --task <slug> --message "…"`, `maestro ls` lists it by ticket, and `maestro dispatch` refuses that id as a duplicate.
- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=shipped mr.id=<ID> mr.url=<MR_URL>`

### 7. Watch the pipeline (optional — only if the user asks to "spy on the pipeline")

Run the shared poller against the MR's branch:

```bash
~/.agents/skills/aircall-dev-flow/scripts/watch-pipeline.sh            # current branch
~/.agents/skills/aircall-dev-flow/scripts/watch-pipeline.sh -b <branch> -R <owner/repo>
```

It polls `glab ci get` until the pipeline reaches a terminal state and prints
failing jobs if it fails. See [the sibling skill's script](../aircall-dev-flow/scripts/watch-pipeline.sh)
(a document link, relative to this file - the runnable path is the home-anchored one above).

- → manifest: `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=watching`, then record the terminal result —
  `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py pipeline.status=success phase=done` (or `pipeline.status=failed`, looping back to phase 3).

### 8. Merge (handoff — only when the user asks to merge the ready batch)

When the user says "merge the ready ones" (or similar): run `dev-flow-status.py --ready`
to collect the gate-approved + green MR URLs, then **invoke the `aircall-merge-train`
skill** on exactly those URLs. As each MR merges, mark it `~/.agents/skills/aircall-dev-flow/scripts/dev-flow-set.py phase=done`
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
- Bundled code is only glue, and it is **not bundled here**: `dev-flow-set.py` /
  `dev-flow-status.py` (manifest) and `watch-pipeline.sh` all live in `aircall-dev-flow`
  and are shared, so the two skills can never disagree about the manifest format.
  Everything else is native worktree, `jira`, `agent-browser-aircall-local`,
  `gitlab-create-merge-request`, and `maestro` (ownership check + `adopt`).
- `.dev-flow.json` and the maestro task record answer different questions: the manifest tracks _this_ flow's phase, the maestro record makes the branch/worktree/MR addressable by any later session. Write both.
- For merging the approved MR afterwards, hand off to the `aircall-merge-train` skill.
