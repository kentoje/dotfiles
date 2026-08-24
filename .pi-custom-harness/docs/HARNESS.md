# Pi harness

A tailored harness for Aircall GitLab frontend work, built on Pi (`@earendil-works/pi-coding-agent`, v0.84.2).
The harness is implemented under `.pi-custom-harness`: its Effect/Pi boundary, planned module directories, colocated deterministic tests, strict typecheck, Biome check, and module-contract validation are present.

Every recommendation is anchored either to a measured number from the session analysis of 55 GitLab sessions, 20 July to 17 August 2026, or to a fact read out of the installed Pi source and package docs.

**Status: reviewed and decided.**
Section 3 through 6 record decisions taken in review, including the ones that went against my recommendation.
Section 7 lists what was rejected and why, so the reasoning survives the decision.

Maestro is deliberately out of scope.
Section 6 covers the holes it leaves.

---

## 1. The inclusion rule

A custom tool earns a slot only if it does one of two things.

**(a) It turns a repeated instruction into a structural guarantee.**
If you have typed the same constraint more than twice, it belongs in a blocked tool call, not in a prompt.
The canonical case: "do not create a new branch or MR" appeared verbatim in three consecutive prompts on `!5676`.

**(b) It collapses a verified high-frequency multi-call sequence into one call with the decision already encoded.**
93 `glab api` calls reshaping the same JSON by hand qualifies.
A `git_status` wrapper does not, because bash already runs it cleanly in one call.

**The corollary that shaped this review: do not wrap a CLI that is already good.**
`agent-browser` ships an accessibility-tree `snapshot` built for models, its own versioned skills, a session model and CDP connect.
`portless get <name>` already prints a URL in one call.
Neither earns a wrapper.
What earns a slot is the decision layer above them, which is why section 5.4 is `preview` and not `browser`.

**The four layers Pi gives you:**

| Layer | Mechanism | Use it when | Failure mode if misused |
| --- | --- | --- | --- |
| **Tool** | `pi.registerTool()` | The model should choose it, and it must work the same way every time. | Encoding taste as a tool makes the agent rigid. |
| **Event handler** | `pi.on("tool_call")`, `pi.on("agent_settled")` | It must fire whether or not the model chooses it. | Hooking something advisory creates noise you learn to ignore. |
| **Skill** | `skills` array | It is knowledge or taste the model applies with judgement. | Encoding a guarantee as a skill means it fires occasionally. |

Measured evidence for row three: 10 explicit skill invocations across 5 skills, out of roughly 50 installed.
Your dev-flow, merge-train and e2e-repair skills encode guarantees, which is why they never fire reliably.
Section 8 retires the three that approved tools now cover.

---

## 2. The tool census

Pi's built-in surface is deliberately tiny.
Read from `dist/core/tools/`, it is exactly seven tools, and all seven are load-bearing.

| Source | Tools | Count |
| --- | --- | --- |
| Pi built-ins | `bash` `edit` `find` `grep` `ls` `read` `write` | 7 |
| `@mrclrchtr/supi-code-intelligence` | `code_orientation` `code_resolve` `code_inspect` `code_graph` `code_find` `code_health` `code_refactor_plan` `code_refactor_apply` | 8 |
| `@mrclrchtr/supi-web` | `web_fetch_md` `web_docs_search` `web_docs_fetch` | 3 |
| `@ff-labs/pi-fff` | `fffind` `ffgrep` | 2 |
| `pi-mcp-adapter` | `mcp` `mcpScript` | 2 |
| `@juicesharp/rpiv-todo` | `todo` | 1 |
| `@mrclrchtr/supi-ask-user` | `ask_user` | 1 |
| `pi-powerline-footer`, `@codexstar/pi-listen`, `@mrclrchtr/supi-settings` | none, UI and voice only | 0 |
| `git:DietrichGebert/ponytail` | not yet enumerated, see section 11 | ? |

**31 tools are now present: 24 existing tools plus the seven harness tools in section 5.**

`pi-subagents` was removed in review, taking `subagent` and `subagent_wait` with it.
See section 3.

**MCP is already optimal and is not a problem.**
pi-mcp-adapter is proxy-only by default: MCP tools sit behind the single `mcp` tool unless you set `directTools`, and your `mcp.json` does not.
Servers are lazy by default, and your Figma and Slack entries are already narrowed shims exposing 5 tools each rather than the 30-plus the upstream Figma server advertises.
Three MCP servers cost 2 schema slots total.
Leave it alone.

---

## 3. What to strip: one package

This is the section that inverted in review, and the result is worth stating plainly.

**Every removal I proposed was rejected, and in the main case I was wrong on the facts.**
The one package that does come out was not on my list.

### `pi-subagents` is removed

Not proposed as a strip.
It fell out of a different decision: no subagent roles ship with the harness.
With no roles and builtins disabled, `subagent` and `subagent_wait` have nothing to dispatch to, so they were two schema slots buying nothing.

Consequences worth knowing:

- Delegation is no longer a tool. It is something you do by opening another session.
- The 2 measured delegations across 55 GitLab sessions say this costs almost nothing today.
- The read-only sweeps that would have suited `scout` are absorbed by `fleet` (5.7) and `code_find`.
- `pi-subagents` acceptance gates are no longer available to the ship-gate. See section 6.

Reversible: reinstall the package and drop role files into `<harness>/agents/**/*.md` if delegation starts to matter.

### The removals I proposed, and why they were rejected

| Proposed | Decision | Reason |
| --- | --- | --- |
| Drop built-in `find` and `grep` | **Keep both** | FFF is git-aware and pre-indexed. Outside a git repo it has nothing to search, and the built-ins are the only fallback. My proposal would have removed the working path for non-repo directories. |
| Trim `supi-code-intelligence` to 5 | **Keep all 8** | The refactor pair earns its slot on cross-package API renames. |
| Audit or drop `ponytail` | **Keep** | Deliberately installed and understood. Still worth enumerating for the census, see section 9. |
| Drop the Atlassian MCP in favour of the `jira` CLI | **Keep both** | MCP for Confluence and rich search, CLI for ticket work. |

**The consequence you now own: the find/grep ambiguity is real and stays.**
It cannot be fixed by removing a tool, so it has to be fixed in prose, and the prose has to name the condition rather than state a preference.

Replace the current line in `~/dotfiles/.pi/agent/AGENTS.md`:

> Use FFF (`ffgrep`, `fffind`) for search when the extension is loaded.

with something that tells the model how to choose:

> Use `ffgrep` and `fffind` inside a git repository.
> Outside one, FFF has no index, so use built-in `grep` and `find`.

That is a guarantee delivered as prose, which section 1 warns about.
It is the correct trade here because the alternative removes a capability you need.
Worth re-reading in a month to see whether the model actually honours it.

---

## 4. Event handlers

Three approved, one declined.
These matter more than the tools, because they fire whether or not the model chooses them.

### 4.1 MR guard - approved, blocks hard

**Evidence.** "do not create a new branch or MR" typed verbatim in three consecutive prompts on `!5676`.
Six MRs absorbed nearly all human attention, `!5680` and `!5676` at 8 separate prompts each.

**Why an event handler and not a tool.** A tool only helps if the model chooses to call it.
Your measured behaviour is that the model reaches for `bash` and runs `glab mr create` directly, so a `create_mr` tool would sit unused next to the bash call that causes the problem.

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (!isToolCallEventType("bash", event)) return;
  if (!/\bglab\s+mr\s+create\b/.test(event.input.command)) return;

  const existing = await findMrForCurrentBranch(ctx.cwd);
  if (existing) {
    return {
      block: true,
      reason: `Branch already has MR !${existing.iid}. Update it instead of opening a second one.`,
    };
  }

  const facts = await repositoryFactsFor(ctx.cwd); // lib/repo-map
  const readiness = await releaseReadinessFor(ctx.cwd, facts.deliveryPolicy); // lib/git
  if (!readiness.ready) return { block: true, reason: releaseReadinessFailureReason(readiness) };
});
```

The policy is per repository: Hydra uses a changeset policy that requires committed changesets only for changed publishable packages; dashboard-v4, conversation-center-ext, analytics-extension, and assets-page use conventional commits. `lib/repo-map` owns the rule and `lib/git` owns branch evidence, so `mr-guard`, `ship-gate`, and `verify` cannot drift.


**Evidence.** The maestro stop-gate fired 22 times in the analysed window: "Do not finish yet - the task is not complete (attempt 1/3). You have not opened the MR."
An agent that wrote correct code but never shipped it would otherwise report success.

An `agent_settled` handler refuses to let the turn end when any of these hold:

- the branch has commits ahead of main but no MR
- the MR has unresolved discussion threads
- the branch has no bound ticket
- the delivery policy's required verification evidence has not passed since the last edit: `verify all` for repository-wide policy or focused `verify test --file …` for focused-only policy

On failure it calls `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })` to push the agent back to work.

**Cap at 3 attempts, matching maestro.**
An ungated loop here is an infinite one, and the failure mode is expensive because it burns tokens silently.

Depends on `mr` (5.1), `verify` (5.3) and `ticket` (5.6), so it lands after them.

### 4.3 Notify-on-settle - approved, failures only

**Evidence.** `maestro notify` ran 48 times.

Rewires your existing `notify` and `ping-me-slack` skills as an `agent_settled` handler.
**Fires only on ship-gate failure or a red pipeline, silent on clean completion.**
A notification you rely on is a guarantee, so it belongs in the event layer, but end-of-turn noise on success is how you learn to ignore it.

### 4.4 Heavy-command lock - declined

Proposed: intercept `pnpm test`, `vitest`, `jest`, `tsc`, `pnpm build` and serialise them on a lockfile, replacing `maestro heavy` (175 calls).

**Declined for now.**

The reasoning is sound: without maestro you are unlikely to run 6 concurrent worktrees again soon, and the gate solves a problem you do not currently have.

**Revisit trigger:** if you return to three or more concurrent worktrees on one machine and notice test runs thrashing.
The handler is about thirty lines and slots into the same `tool_call` extension as 4.1, so the cost of deferring is close to zero.

---

## 5. Tools

Seven approved.

### 5.1 `mr` - status, threads, reply, update, watch

**Evidence.** 261 `glab` invocations: `api` 93, `mr view` 61, `mr create` 23, `mr list` 16, `mr update` 13.
Plus 35 pipeline notification events, which is what `watch` replaces.

- `status` returns iid, title, draft, `discussions_ok`, pipeline state, unresolved count, bound ticket
- `threads` returns `[{ id, author, is_bot, file, line, body, resolved }]`
- `reply` posts to a thread and optionally resolves it
- `update` regenerates title and description from commits
- `watch` injects a message when the pipeline settles

`is_bot` is what makes the Bugbot triage habit cheap.
Your measured pattern is "is this true?" before "fix them", and separating bot findings from human review currently costs a hand-rolled API call.

**There is deliberately no `open` action.**
Creation stays in bash, guarded by 4.1, because that is where the model actually reaches.

**The `watch` footgun.**
Pi has no background job manager, so the extension owns its own timer.
It must clear it on `session_shutdown`, or an orphaned poller survives `/new` and wakes the wrong session about the wrong MR.
Pi's extension docs have a "Long-lived resources and shutdown" section for exactly this.

### 5.2 `worktree` - new, verify, list, rm

**Evidence.** The most recurrent operational complaint in the corpus.
Verbatim: "we are missing mandatory files", "we did not have any `.env.local` in the WT. And we had issues with the certs.", "what is wrong with my WT setup here?".
Already half-scripted as `dev-flow-set.py`, 35 calls.
`git worktree` 27 calls.

**It delegates provisioning rather than encoding it.**
Corrected after tracing a real task: `conversation-center-ext` already ships `scripts/setup-worktree.sh` and `scripts/new-worktree.sh`, built by you to work on any machine.
Reimplementing certs, `.env.local`, `node_modules` and GraphQL schema download inside the tool would fork logic the repo already owns and would drift the moment the repo changes.

So `worktree new` calls the repo's script when `lib/repo-map` says one exists, and adds only what the repo cannot know:

- portless registration, since the route name depends on the worktree
- the `verify` pass afterwards
- a fallback provisioning path for repos with no script yet

**The default worktree root is `~/.pi/worktrees`.**
`lib/repo-map` owns this default and accepts an explicit override, so routes follow `https://<worktree>.<project>.localhost` under the configured portless route.

`verify` is not garnish.
You asked for it explicitly: "create a fake wt, and try the script onto it", and separately "It should be working on any machine not only mine".
Both constraints belong in the tool, so `verify` runs against a throwaway worktree and reads nothing from your home directory.

**This tool mutates files, so it must use `withFileMutationQueue()`.**
Pi runs tool calls in parallel by default.
Without the queue, `worktree new` writing `.env.local` while built-in `edit` touches the same tree can silently lose one of the two writes.
Resolve to an absolute path first and queue the whole read-modify-write window, not just the final write.

### 5.3 `verify` - types, lint, test, all

**Evidence.** `jest` 64, `biome` 61, `tsc`/`check-types` 49, `vitest` 40, `playwright` 9.
214 calls, each hand-rolled with its own `2>&1 | tail -50` and its own guess at the right runner.

**It is a check list per repo, not a runner name per repo.**
Corrected after tracing a real task.
`conversation-center-ext` has five checks, and two of them are bespoke:

| Check | Command there |
| --- | --- |
| types | `pnpm ts:check` (`tsgo --noEmit`) |
| lint | `pnpm biome:check` |
| tests | `pnpm test` (jest, `@swc/jest`) |
| graphql | `pnpm graphql:check` (gql-tada) |
| fallow | `pnpm fallow` |

A `verify` that knew only types, lint and test would let a `fallow` failure reach CI, which has already happened: "fallow check is failing on ... fix it".

Runners vary too: vitest in hydra and assets-page, jest in the three extensions and dashboard-v4.
`lib/repo-map` owns the whole list.

Returns `{ ok, failures: [{ file, line, rule, message }], duration }`.
Structured failures instead of a truncated tail.

Note this tool no longer carries the concurrency lock, since 4.4 was declined.
Its only job is correctness.

### 5.4 `preview` - url, up

**Evidence.** `portless` 79 calls, `curl` 107, and the verbatim questions "the dev server is running?" (twice) and "run the server so that I can debug".

Deliberately narrow.
This is not a browser wrapper and not a navigation tool, for the reason in section 1.

- `url` resolves the current worktree to its portless URL and asserts the route exists
- `up [--mode <name>]` ensures the dev server is running, starting it through portless if not

Returns `{ url, running, authMode, mode }`.

**`--mode` was missing and matters.**
`conversation-center-ext` ships `dev` (sandbox), `dev:integrate` and `dev:mock`, the last running against MSW.
For UI work that is entirely about edge cases in a display rule, driving real data into the state is slow and flaky, and `--mode mock` makes it deterministic.
Mode names are per repo, so `lib/repo-map` owns them.

**This tool serves four of the five repos.**
Only hydra has Storybook, so `preview` is the common path and `story` is the special case.
The implementation order in section 10 puts `preview` before `story`, matching that scope.

**`authMode` is a fact the tool reports, not a step it performs.**
This was the key correction in review.
Auth is a per-repo property:

| authMode | Meaning | Known repos |
| --- | --- | --- |
| `none` | No auth needed | Storybook targets |
| `dev-plugin` | Build-layer plugin resolves auth, nothing to do | `assets-page` (vite `dev-auth-plugin.ts`), `conversation-center-ext` (rsbuild port), `dashboard-v4` |
| `browser-login` | Needs the interactive login flow | To be determined, see section 9 |

The agent reads `authMode` and decides whether it can navigate directly or must run the `agent-browser-aircall-local` flow first.

### 5.5 `story` - Storybook render

Kept separate from `preview` by decision, rather than folded in as a mode.

**Evidence.** Storybook 63, `agent-browser` 93.
331 of 465 edit calls land in `packages/ds` and `packages/blocks`.
337 `.tsx` edit calls across only 63 distinct files, roughly five edits per file: iterating on a component under review.

Today rendering one story means resolving the port for this worktree, building the preview iframe URL by hand, driving agent-browser, then screenshotting.
Four steps, repeated dozens of times, and the port lookup is wrong often enough that you asked "what is the port of your storybook server?" mid-session.

- `story show <component> [--story] [--viewport] [--theme]` returns a screenshot, the resolved URL, and console errors
- `story list <component>` returns every story id

Rendering the preview iframe directly keeps the manager chrome out of frame, which is what `agent-browser-storybook-dev` does by hand today.
`authMode` is always `none` here, which is part of why it stays a separate tool.

### 5.6 `ticket` - binding only

Narrowed in review from four actions to one concern.

**No `show` or `create`.**
You kept both the `jira` CLI and the Atlassian MCP, and a third path to the same data would make the ambiguity worse rather than better.

What the tool owns is the branch-to-ticket-to-MR association, which nothing else tracks:

- `bind <KEY>` writes the association
- `current` resolves it from the branch name

This exists because the ship-gate (4.2) needs to check "is a ticket bound", and because every working branch in the corpus carries a key.
The implementation stores the binding in the worktree's `.dev-flow.json`; whether a central index or cache is also needed remains open in section 11.

### 5.7 `fleet` - status, versions, sync, install, prune

**Evidence.** Verbatim and repeated: "are we missing any extensions locally?", "for each extensions make sure we are aligned with the latest main, reset --hard, drop any work pending", "run installs across all of them", "are all extensions sharing the same tractor version?".
Peak of 6 concurrent worktrees across 5 repos on 20 July.

- `status` per repo: branch, dirty, ahead/behind main, open MRs
- `versions <pkg>` which version each repo pins
- `sync [--hard]` align to latest main
- `install` run installs across all repos
- `prune` kill orphaned portless dev servers from crashed sessions

These are the sweeps currently done inline, one repo at a time, burning context in the session doing real work.

**`sync --hard` is destructive.**
It must print exactly what it will drop and confirm through `ask_user` before proceeding, never just run.

---

## 6. What maestro leaves behind

| Maestro capability | Measured | Replacement | Status |
| --- | --- | --- | --- |
| Stop-gate | 22 firings | `agent_settled` handler (4.2) | Approved |
| Progress notify | 48 calls | `agent_settled` handler, failures only (4.3) | Approved |
| Worktree lifecycle | 35 `dev-flow-set.py` calls | `worktree` tool (5.2) | Approved |
| Resource gate | 175 `maestro heavy` calls | `tool_call` lock (4.4) | **Declined, accepted risk** |

The fourth row is the only accepted loss.
It is a real one at high parallelism and it is worth naming rather than burying: nothing now stops six worktrees running full test suites at once.
The revisit trigger is in 4.4.

One option was considered and dropped.
`pi-subagents` ships background execution, missions, a watchdog, and acceptance gates via a `gate` parameter taking a host-run verification command, which could have absorbed part of the ship-gate.
The package was removed in review (section 3), so the `agent_settled` handler in 4.2 carries that job alone.

---

## 7. Rejected, and why the reasoning matters

These stay out.
Recorded so the reasoning survives, and so a future re-measure can overturn them on evidence rather than taste.

| Candidate | Why not |
| --- | --- |
| **agent-browser wrapper** | Already an agent-facing CLI: accessibility-tree `snapshot`, versioned skills, session model, CDP connect. A wrapper buys a translation layer and costs a slot. |
| **portless wrapper** | `portless get <name>` is already one call. `preview` covers the decision above it. |
| **Changeset generator** | Roughly 19 `.changeset` writes, which is borderline frequency. The one failure you actually corrected was semantic: "remove the `!`, it's not breaking changes". A generator would have made the same mistake. Gated in 4.1 instead, so the model still writes it and the bump level stays a judgement call. |
| **DS lookup (`ds find`)** | `code_find` plus `code_orientation` answer the precise version, `scout` answers the fuzzy one. |
| **Dead-component detector** | One measured session. That is a `scout` prompt, not a tool. |
| **Screenshot diff** | No measured diff workflow to encode, despite the pixel-perfection standard in your CLAUDE.md. |
| **`herdr` wrapper** | 44 calls, but pane layout is a human surface and the need drops with maestro gone. |
| **Google Docs reader** | Three pasted Docs URLs, and `web_fetch_md` cannot authenticate so they fail today. Judged too thin to solve. Paste the text when it matters. |
| **Staleness check in `preview`** | Would have encoded the "I see DashboardFilters which is not supposed to be on that branch" bug as a check. Dropped as speculative. |

---

## 8. Configuration changes

```jsonc
{
  // Built-in find and grep stay as the non-git-repo fallback for pi-fff.
  "extensions": ["./extensions"]
  // Harness skills are supplied with --skill by the pih abbreviation.
}
```

The implemented settings use the local extension directory. `--no-skills` removes auto-discovery, so the harness skill directory is supplied explicitly with `--skill`.

**Four skills retired**, each because an approved tool or handler now owns the same guarantee:

| Retired skill | Now owned by |
| --- | --- |
| `aircall-dev-flow` | `worktree` + `mr` + `ticket` + ship-gate |
| `aircall-dev-flow-maestro` | Dead with maestro dropped |
| `gitlab-create-merge-request` | MR guard (4.1) plus guarded bash |
| `agent-browser-storybook-dev` | `story` (5.5) |

**`AGENTS.md` changes:**

1. Rewrite the FFF line to name the condition rather than the preference, per section 3.
2. **No scout-first default.** Proposed and declined: you delegate when you want to, and `fleet` plus `code_find` remove most of the inline-sweep cost anyway.

---

## 9. Install mechanics

Verified against the installed Pi docs and CLI.

**Extensions** are auto-discovered from `~/.pi/agent/extensions/*.ts` or `*/index.ts`, and from `.pi/extensions/` project-locally once the project is trusted.

```typescript
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "mr",
    label: "Merge Request",
    description: "Query and update the merge request for the current branch",
    promptSnippet: "Inspect MR status, threads, and reply to review discussions",
    promptGuidelines: ["Use mr for merge request state instead of hand-rolling glab api calls."],
    parameters: Type.Object({ action: StringEnum(["status", "threads"] as const) }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "..." }], details: {} };
    },
  });
}
```

Four details that matter:

- Parameters use **typebox**, not zod. Use `StringEnum` for enums so Google models stay compatible.
- `promptGuidelines` bullets are appended flat with no tool-name prefix, so each must name its own tool. Write "Use mr when...", never "Use this tool when...".
- Anything that mutates files must use `withFileMutationQueue()` on the resolved absolute path. This applies to `worktree`.
- Some models pass a leading `@` on paths. Built-ins strip it; your tools must too.

**Commands:** `pi install <source>`, `pi list`, `pi config`, `pi update`.

**Dev loop:** `pi -e ./extensions/mr/index.ts` loads one extension without installing it.
Build each tool against a real worktree this way before adding it to `extensions`.

**Measuring whether a tool earns its slot:** `pi --tools bash,edit,read,write,mr` is a strict allowlist and `--exclude-tools` is the denylist.
Run a week with a tool excluded and see whether you miss it.

**Wiring into dotfiles.** `~/.pi/agent/` already symlinks `AGENTS.md`, `settings.json`, `models.json`, `mcp.json` and `keybindings.json` to `~/dotfiles/.pi/agent/`.
Add `extensions/` to the same pattern.

---

## 10. Implementation status and build order

| Phase | Ships | Why here |
| --- | --- | --- |
| 0 | Retire 4 skills, rewrite the FFF line in `AGENTS.md` | Config only, reversible, no code. |
| 1 | MR guard + changeset gate (4.1) | Highest leverage per line. Depends on nothing. **Implemented.** |
| 2 | `worktree` (5.2) | Top recurring friction. Everything downstream assumes a working worktree. **Implemented.** |
| 3 | `mr` (5.1) and `verify` (5.3) | Highest call volume, and both are prerequisites for the ship-gate. **Implemented.** |
| 4 | `ticket` (5.6), then ship-gate + notify (4.2, 4.3) | The gate needs `mr`, `verify` and `ticket` to check against. **Implemented.** |
| 5 | `preview` (5.4) | Serves four of five repos. Ship before `story`. **Implemented.** |
| 5b | `story` (5.5) | hydra only. Valuable, but one repository. **Implemented.** |
| 6 | `fleet` (5.7) | Real value, nothing depends on it. **Implemented.** |

The module sequence above is implemented in the current tree; its rationale remains useful for dependency direction.
The remaining future artifact is `APPEND_SYSTEM.md`, which is intentionally deferred until a real session can confirm the assembled prompt (see section 10).

---

## 11. Open questions

1. **What does `ponytail` register?** You are keeping it deliberately, but its tool surface is still missing from the section 2 census. One `pi config` run closes this.
2. **Which repos are `browser-login`?** Section 5.4 has `assets-page`, `conversation-center-ext` and `dashboard-v4` as `dev-plugin`, and Storybook as `none`. The remaining repos are unclassified, and `preview` cannot report `authMode` without the full map.
3. **Where does `ticket` binding live beyond one worktree?** The implementation writes a `.dev-flow.json` manifest per worktree, matching what you do today. A single `~/.pi/agent/bindings.json` could survive worktree deletion and make `fleet status` cheaper. I lean central, with the per-worktree file as a cache; that design remains unresolved.
4. **Which ship-gate checks fire spuriously?** The ticket-binding and verify-freshness checks are the two most likely to annoy. Ship all four, log which one fires, and drop whichever cries wolf.

---

## Appendix: measurements cited

From the session analysis of 55 GitLab sessions, 20 July to 17 August 2026.
Shell figures count occurrences of a command inside an agent bash call.

- `glab` 261 total: `api` 93, `mr view` 61, `mr create` 23, `mr list` 16, `mr update` 13
- `jira` 65
- Browser and dev server: `curl` 107, `agent-browser` 93, `portless` 79, Storybook 63, `herdr` 44
- Test and lint: `jest` 64, `biome` 61, `tsc`/`check-types` 49, `vitest` 40, `playwright` 9
- Git: `status` 137, `diff` 110, `add` 77, `push` 43, `log` 41, `show` 33, `worktree` 27, `fetch` 23, `commit` 21
- `dev-flow-set.py` 35
- maestro: `heavy` 175, `notify` 48; stop-gate fired 22 times
- Edits: 465 Edit/Write calls over 129 distinct files; `.tsx` 337 calls over 63 files; `packages/ds` 171, `packages/blocks` 160
- 35 pipeline notification events
- Peak 6 concurrent worktrees across 5 repos, 20 July
- 2 subagent delegations in GitLab scope; 10 skill invocations across 5 skills of roughly 50 installed
- Median session 18 minutes, 30 of 38 under an hour

Platform facts read from the installed Pi 0.84.2 source, docs and package READMEs on 17 August 2026.
