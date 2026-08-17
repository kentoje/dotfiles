# Walkthrough: a Figma-backed ticket, end to end

A trace of one realistic task through the designed harness, to find gaps before building.

**Scenario.** `DS-61`, "Add a `Callout` component to `@aircall/ds`", with a Figma link in the ticket description.
Repo: hydra. Target: `packages/ds`.

Legend for the layer column:

- **bash** plain command, no harness involvement
- **tool** a harness tool the model chooses to call
- **handler** fires whether or not the model chooses it
- **skill** loaded from `<harness>/skills/`, applied by judgement
- **mcp** through the `mcp` proxy

---

## The pipeline

| # | Step | Layer | Call |
| --- | --- | --- | --- |
| 1 | Read the ticket, extract the Figma URL | bash | `jira issue view DS-61` |
| 2 | Create and provision the worktree | tool | `worktree new DS-61` |
| 3 | Bind ticket to branch | tool | `ticket bind DS-61` |
| 4 | Pull design structure | mcp | `figma_get_design_context(url)` |
| 5 | Pull design tokens | mcp | `figma_get_variable_defs(url)` |
| 6 | Pull reference image | mcp | `figma_get_screenshot(url)` |
| 7 | Orient in the DS package | tool | `code_orientation packages/ds` |
| 8 | Find prior art and token names | tool | `ffgrep` |
| 9 | Component conventions | skill | `aircall-hydra-ui-lib` |
| 10 | Write component, story, exports | tool | `write`, `edit` |
| 11 | Naming and type conventions | skill | `write-discoverable-code`, `typescript-best-practices` |
| 12 | List available stories | tool | `story list callout` |
| 13 | Render and capture | tool | `story show callout --story Default` |
| 14 | Compare render to step 6 | **gap** | by eye, no tool |
| 15 | Iterate 10 to 13 | - | measured at roughly five edits per file |
| 16 | Types, lint, tests | tool | `verify all` |
| 17 | Write the changeset | tool | `write .changeset/ds-61-callout.md` |
| 18 | Commit and push | bash | `git add -A && git commit && git push -u origin DS-61` |
| 19 | Open the MR | bash | `glab mr create ...` |
| 20 | **Guard fires** | handler | `mr-guard`: no existing MR, changeset present, allow |
| 21 | Watch the pipeline | tool | `mr watch` |
| 22 | Wake on settle | handler | `sendMessage(deliverAs: "followUp", triggerTurn: true)` |
| 23 | Read review threads | tool | `mr threads --unresolved` |
| 24 | Triage bot findings | skill + judgement | `is_bot` splits Bugbot from human review |
| 25 | Fix and resolve | tool | `mr reply --thread <id> --resolve` |
| 26 | **Ship-gate fires** | handler | `agent_settled`: MR exists, threads clear, ticket bound, verify green |
| 27 | Notify only if blocked | handler | `notify-on-settle`, silent on success |

Steps 20, 22, 26 and 27 are the ones nobody chose to run.
That is the point of the handler layer.

---

## What this trace confirms

**The MR guard fires at the right moment.**
Step 19 is a bash call, which is exactly where the model actually reaches, and step 20 intercepts it.
A `create_mr` tool would have sat unused beside it.

**The changeset gate has a natural home.**
Step 17 is a judgement call the model makes, and step 20 enforces only that it happened.
That is the split decided in HARNESS.md section 7: gate the existence, never generate the content.

**`verify` earns its slot at step 16.**
Hydra is vitest and the extensions are jest.
Without the encoded mapping the agent rediscovers this every session.

**The ship-gate has everything it needs by step 26.**
All four of its checks resolve against state produced earlier in this same trace, which is why it sequences after `mr`, `verify` and `ticket` in the build order.

---

## Gaps this trace exposes

### Gap 1: the worktree root is undefined

Step 2 cannot be implemented as specified.

Worktrees used to live at `~/.maestro/worktrees/<repo>/<task>`, created by maestro.
Maestro is dropped, and nothing in HARNESS.md 5.2 says where `worktree new` should put anything.

Needs a decision before phase 2 of the build.
Options: a central `~/worktrees/<repo>/<ticket>`, a repo-sibling `<repo>-worktrees/<ticket>`, or repo-local `.worktrees/<ticket>` which must then be gitignored.
The portless URL shape depends on this, since routes are `https://<worktree>.<project>.localhost`.

### Gap 2: Figma access couples the harness to Claude Code

Steps 4 to 6 run through `figma-via-claude`, which lives in `~/.claude/mcp-servers/` and works by booting a headless Claude Code session to borrow its Figma connector.

Three consequences:

- **Cost and latency.** Roughly $0.04 and 10 to 20 seconds per call. This trace makes three calls before a line of code is written.
- **Coupling.** A harness built to be self-contained depends on a sibling agent's install and authentication. Remove Claude Code and Figma access dies.
- **It is not a Pi limitation to route around.** The shim exists because Figma's remote MCP only admits catalog clients (VS Code, Cursor, Claude Code) and returns 403 to anything else.

The alternative is Figma's desktop MCP server on `127.0.0.1:3845`, which is free and fast but needs the desktop app running and a Dev or Full seat.

Decide before phase 0, because it determines what goes in the harness `mcp.json`.

### Gap 3: nothing maps Figma tokens to DS tokens

Step 5 returns the Figma variable names.
Step 10 needs the `@aircall/ds` token names.
Nothing bridges them, so the agent greps and guesses.

This is the `ds find` tool rejected in HARNESS.md section 7, and this trace is the strongest evidence yet for revisiting it.
The rejection reasoning was that `code_find` and `code_orientation` cover the question.
They cover "does this component exist", not "which DS token corresponds to this Figma variable".

Worth reconsidering as a narrow `ds tokens` capability rather than the broad `ds find` I originally proposed.

### Gap 4: step 14 has no tool, and this is the case that justifies one

Screenshot diffing was rejected for lack of a measured diff workflow.
A Figma-backed task is precisely the workflow that supplies one: there is a reference image from step 6 and a render from step 13, and the standard being applied is "obsessed with pixel perfection".

The honest position is that the earlier rejection was measured against a corpus that predates having `story show` and `figma_get_screenshot` in the same session.
Not a reversal yet, but the trigger to reconsider is now named.

### Gap 5: `mr watch` can lose its notification

Step 21 registers a timer the extension owns, because Pi has no background job manager.
If the session ends between 21 and 22, the wake never arrives and nothing reports the loss.

Mitigation is to have the ship-gate at step 26 treat "watching a pipeline that has not settled" as a reason to hold, rather than letting the turn end silently.
Worth specifying when `mr watch` is built.

---

## Where the human steers

Of the 27 steps, the harness needs you at four, and stops you at exactly one.

### Forced stops, built into the design

| Step | What forces it | Mechanism |
| --- | --- | --- |
| none in this trace | - | - |

The only forced stop in the whole design is `fleet sync --hard`, which confirms through `ask_user` before destroying pending work.
It does not appear in this trace.

**A Figma-backed ticket can therefore run start to finish without asking you anything.**
Whether that is right is the open question in the next subsection.

### Judgment points, where you steer because nothing else can

| Step | Decision | Why no tool can take it |
| --- | --- | --- |
| 9 to 10 | Component API shape and package placement | Compound versus prop, and `ds` versus `blocks`. Your corpus is full of these: "Filter belongs in `@aircall/blocks`, NOT `@aircall/ds`", "PUT IT IN ComboboxBody, NOT FilterSelect". The skill informs the choice, it does not make it. |
| 14 | Does the render match the design | Gap 4. No diff tool, and the standard is "obsessed with pixel perfection". Measured precedent: "STORY REVIEW from the task owner, who walked all ten stories in Storybook. Seven findings." |
| 17 | Changeset bump level | Deliberately not generated, per HARNESS.md section 7. The one failure you corrected was semantic: "remove the `!`, it's not breaking changes". |
| 24 | Is the Bugbot finding real | Measured pattern is "is this true?" before "fix them". Automating the fix would automate obeying a bot you audit. |

These four are the residue.
Everything else in the trace is mechanical, and the harness exists to absorb it.

### What the harness takes off your plate

Each of these is a prompt you measurably typed, now answered by a module:

| You used to type | Now handled by |
| --- | --- |
| "the dev server is running?" (twice), "run the server so that I can debug" | `preview up`, `story show` |
| "what is the port of your storybook server?" | `story` resolving portless itself |
| "open mr", "open the MR" | step 19 plus `mr-guard` |
| "did you create a ticket?", "you should have created a ticket" | ship-gate check 3 |
| "what is wrong with my WT setup here?", "we are missing mandatory files" | `worktree verify` |
| "https://.../-/jobs/... is failing", "pipeline is failing 2 jobs" | `mr watch` |
| "do not create a new branch or MR" (three consecutive prompts) | `mr-guard` blocking |

### The hole: the ship-gate cannot tell whether it looks right

The `agent_settled` gate checks four things: MR exists, threads resolved, ticket bound, `verify all` green.

All four can pass on a component that looks nothing like the Figma design.
Types compile, tests pass, lint is clean, the MR is open, and step 14 was skipped or done badly.

For a design-backed ticket that is the one failure mode that matters, and it is the only one the gate is blind to.

Three options, none chosen yet:

1. **A fifth gate check: "a render was captured since the last edit to a component file."** Cheap, mechanical, and it only proves you looked, not that it matched.
2. **A forced `ask_user` at step 14** presenting the Figma reference and the render side by side. Turns the trace's zero forced stops into one, at the point where your judgment is provably needed.
3. **Accept it.** You are supervising a single session rather than a fleet, so you will see the render anyway.

Option 3 is only safe while you stay in the loop, which leads to the last observation.

### You are more in the loop than you were, not less

Worth stating plainly, because the design implies it without saying it.

Maestro gave you a dispatch layer: "approve, dispatch all 4 make sure CI is not failing", then it ran them and reported back.
`pi-subagents` would have given a smaller version of the same thing.
Both are now out.

So this harness supervises one session at a time.
It replaces mechanical steering with fewer, higher-value interventions, but it does not replace the dispatch-and-walk-away mode.
If that mode is something you want back, the honest answer is that it needs a fleet layer, and this harness is deliberately not one.

---

## What does not appear in this trace

- **No subagent delegation.** `pi-subagents` was removed. Steps 7 and 8 run inline.
- **No `preview` tool.** Storybook work uses `story`. `preview` covers the app surfaces, where `authMode` matters.
- **No context files.** Hydra's per-directory `AGENTS.md` do not load under `--no-context-files`. The `aircall-hydra-ui-lib` skill at step 9 is what replaces them, which is why porting it well matters more than it first appeared.
