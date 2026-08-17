# Harness architecture

How the harness in `~/dotfiles/.pi-custom-harness` is built and isolated.
`HARNESS.md` in this directory decides *what* to build.
This document decides *how*.

Design only.
No implementation exists yet.

---

## 1. Stack

**TypeScript on bun, with Effect (`effect-ts`) as the core runtime.**

The extension boundary is TypeScript and not negotiable: Pi loads `.ts` modules that import `ExtensionAPI` and declare parameters with typebox.
Bun runs `.ts` directly, so there is no build step and no watch loop.

### Why Effect earns its place here

Effect is not used anywhere in your stack today (not in hydra, dashboard-v4, or the extensions), so this is a new bet.
It is a good one, for reasons that map onto requirements you already stated rather than onto general enthusiasm.

| What you asked for | What Effect gives |
| --- | --- |
| A `.purpose` file recording the contract, including errors | `Effect<A, E, R>` puts the error channel in the type. The Errors section of `.purpose` becomes type-checked rather than merely documented. |
| "Very modular code so that we can isolate the behaviour of each" | `Layer` and `Context` are real dependency injection. Each module declares the services it needs; tests swap a fake `GitLabService` for the real one without touching the module. |
| `mr watch` must not orphan its timer | `Effect.acquireRelease` with a `Scope` tied to `session_shutdown` makes cleanup structural instead of remembered. This was a flagged footgun in HARNESS.md 5.1. |
| Pipeline polling | `Schedule` gives retry and backoff, cancellable, without hand-rolled `setInterval`. |
| Every tool shells out to glab, git, portless, pnpm | `@effect/platform` `Command` models subprocesses with typed exit codes, streams, and interruption. This is the hot path for the entire harness. |

### The costs, stated plainly

1. **Learning curve.** `Layer` and `Context` are the steep part. Budget for the first two modules taking noticeably longer than the rest.
2. **Startup cost.** Extensions load at session start. Effect plus `@effect/platform` is a sizeable import. Measure cold start after the first extension lands; if it regresses, lazy-import `core.ts` from the shell so only invoked tools pay.
3. **Boundary impedance.** Pi is Promise and callback based. Every extension needs `Effect.runPromise` at the edge, and `ctx.signal` must be wired to Effect interruption so Esc actually cancels. That is one shared helper, written once, in `lib/pi-bridge`.

### The hard constraint that shapes every module

Read from `dist/core/extensions/types.d.ts`:

```typescript
parameters: TParams;                                  // TParams extends TSchema, from typebox
prepareArguments?: (args: unknown) => Static<TParams>;
```

**Effect Schema cannot be used for tool parameters.** Pi requires a typebox `TSchema`.

Do not declare the shape twice.
Typebox is the single source of truth, and the Effect side derives its input type from it:

```typescript
// schema.ts
export const MrParams = Type.Object({ action: StringEnum(["status", "threads"] as const) });
export type MrInput = Static<typeof MrParams>;   // <- the Effect core consumes this
```

This constraint is a gift rather than a tax.
It forces exactly the shell-and-core split you asked for.

---

## 2. Module anatomy

Every module, whether a tool, an event handler, or a shared library, has the same five files.

```
extensions/mr/
├── .purpose        the contract in prose. Intent, contract, edge cases, non-goals, evidence.
├── schema.ts       typebox parameters. The single machine-readable contract.
├── index.ts        the Pi shell. Thin. Registers, validates, runs, maps errors to ToolResult.
├── core.ts         the Effect program. All logic. Knows nothing about Pi.
└── core.test.ts    tests core.ts against fake service layers. No Pi, no network.
```

The rule that keeps this honest: **`core.ts` must never import from `@earendil-works/pi-coding-agent`.**
If it does, the module is no longer testable in isolation and the split has failed.
This is one lint rule and it is worth enforcing.

`index.ts` stays roughly this shape for every module:

```typescript
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "mr",
    parameters: MrParams,
    async execute(id, params, signal, onUpdate, ctx) {
      return runTool(mrCore(params), { signal, cwd: ctx.cwd });  // lib/pi-bridge
    },
  });
}
```

All Pi-specific concerns (signal wiring, error to `ToolResult` mapping, `withFileMutationQueue`) live in `lib/pi-bridge` and are applied once per module, not reimplemented.

---

## 3. The `.purpose` specification

Fixed headings, so a lint can assert every module has all of them.

```
# <module name>

## Intent
Why this exists at all, in plain words. The problem it removes.

## Contract
Input:   the typebox shape, named
Output:  the success shape
Errors:  each failure mode, and what the caller should do about it

## Behaviour
Ordered steps. What it does, in sequence.

## Edge cases
- condition -> handling

## Non-goals
What this deliberately does not do, and which module does it instead.

## Evidence
The measured number or verbatim quote that justifies the slot.
```

**`Evidence` is the section that matters most a year from now.**
It ties each module back to the inclusion rule in HARNESS.md section 1.
Without it, nobody can tell whether a tool still earns its place, and the harness accretes.

`Errors` in `.purpose` should list the same union that `core.ts` declares in its `E` channel.
Those two drifting apart is the main thing a reviewer should check.

Note that `.purpose` is a dotfile and hidden from plain `ls`.
That is the trade for keeping it visually adjacent to `index.ts` rather than shouting from the directory listing.

---

## 4. Layout

```
.pi-custom-harness/
├── settings.json               packages, extensions, skills. Fully declarative.
├── mcp.json                    harness-owned MCP servers
├── APPEND_SYSTEM.md            the harness prompt. WRITTEN LAST, in phase 8.
│                               No SYSTEM.md, no AGENTS.md. See sections 5 and 10.
├── auth.json      -> ~/.pi/agent/auth.json     (symlink, never committed)
├── models.json    -> ~/.pi/agent/models.json   (symlink)
├── package.json                effect, @effect/platform, typebox, biome
│
├── lib/                        shared. Not discovered by Pi as extensions.
│   ├── pi-bridge/              Effect <-> Pi edge: runTool, signal wiring, error mapping
│   ├── gitlab/                 glab wrapper + REST client        (GitLabService)
│   ├── git/                    branch, worktree, status          (GitService)
│   ├── portless/               URL resolution, server lifecycle  (PortlessService)
│   ├── repo-map/               repo -> runner, authMode, paths   (RepoMap)
│   └── result/                 structured result and error types
│
├── extensions/                 one directory per module, each with a .purpose
│   ├── mr-guard/               handler  (HARNESS.md 4.1)
│   ├── ship-gate/              handler  (4.2)
│   ├── notify-on-settle/       handler  (4.3)
│   ├── mr/                     tool     (5.1)
│   ├── worktree/               tool     (5.2)
│   ├── verify/                 tool     (5.3)
│   ├── preview/                tool     (5.4)
│   ├── story/                  tool     (5.5)
│   ├── ticket/                 tool     (5.6)
│   └── fleet/                  tool     (5.7)
│
├── skills/                     harness-owned only. Nothing from ~/.agents or ~/.claude.
├── themes/
└── docs/
    ├── HARNESS.md              what to build and why
    └── ARCHITECTURE.md         this file
```

Pi discovers extensions from `<configDir>/extensions/*.ts` and `*/index.ts`.
`lib/` sits outside `extensions/`, so it is never mistaken for one.

### `lib/repo-map` is the single source of truth

Three separate modules need the same per-repo facts, and duplicating them is how they drift:

| Fact | Consumed by |
| --- | --- |
| test runner (vitest in hydra, jest in the extensions) | `verify` |
| `authMode`: `none` / `dev-plugin` / `browser-login` | `preview`, `story` |
| worktree root, portless app name | `worktree`, `preview`, `fleet` |
| repo list for sweeps | `fleet` |

One module owns this table.
Everything else asks it.

---

## 5. Isolation

Fully hermetic, as decided.
Nothing from `~/.agents`, `~/.claude`, `~/.pi/agent`, or any repository loads.

### The mechanism

`PI_CODING_AGENT_DIR` overrides the config root, so Pi reads `settings.json`, `SYSTEM.md`, `AGENTS.md`, `extensions/`, `skills/`, `mcp.json`, `models.json` and `themes/` from the harness.

Three things leak past that override and each needs an explicit kill:

| Leak | Source | Kill |
| --- | --- | --- |
| `~/.agents/skills/` | Global discovery, independent of the config dir | `--no-skills`, then re-add the harness dir with `--skill` |
| `.agents/skills/` and `.pi/skills/` walking up from cwd | Project discovery | `--no-skills` plus `defaultProjectTrust: "never"` |
| `AGENTS.md` and `CLAUDE.md` walking up from cwd | Context file discovery | `--no-context-files` |

### There is no AGENTS.md, and the prompt vehicle is APPEND_SYSTEM.md

Settled from `dist/core/resource-loader.js` and `dist/core/system-prompt.js`.

`--no-context-files` makes `agentsFiles` an empty array, and that covers **every** context file including `<configDir>/AGENTS.md`.
So an `AGENTS.md` in the harness would never load. It is not part of this design.

`SYSTEM.md` loads through a different path, `discoverSystemPromptFile()` off `agentDir`, and is unaffected by that flag.
But `buildSystemPrompt` takes a hard branch when a custom prompt is present: the `customPrompt` path appends only the append-section, context files, skills and cwd.
It never emits the `Available tools:` list built from each tool's `promptSnippet`, nor the `Guidelines:` list built from `promptGuidelines`.

**`SYSTEM.md` would therefore silently delete every per-module prompt contribution.**
That defeats the modularity in section 2, because adding a module would no longer update the prompt.

The prompt is assembled from four sources, and the harness owns the second and third:

| Order | Source | Owner |
| --- | --- | --- |
| 1 | Pi default header: identity, auto `Available tools:`, auto `Guidelines:`, pi self-docs | Pi |
| 2 | `APPEND_SYSTEM.md` | Harness, hand-written |
| 3 | Per-module `promptSnippet` and `promptGuidelines` | Each module, next to its `.purpose` |
| 4 | Skills catalogue, appended when `read` is active | `skills/` |
| - | Context files | Empty, killed by `--no-context-files` |

`APPEND_SYSTEM.md` holds only what cannot be expressed as a tool, a handler, or a per-module guideline.
Do not list tools in it; source 3 does that automatically.
Do not list skills in it; source 4 does that automatically.

### The abbreviation

Add to `~/dotfiles/.config/fish/includes/abbr.fish`:

```fish
# Pi custom harness
abbr pih 'PI_CODING_AGENT_DIR=$HOME/dotfiles/.pi-custom-harness pi --no-context-files --no-skills --skill $HOME/dotfiles/.pi-custom-harness/skills'
```

Single quotes keep `$HOME` literal in the expansion, so the abbreviation stays portable to another machine.

The `--skill` flag is not optional and not redundant.
`--no-skills` discards the `skills` array in `settings.json` as well as auto-discovery, so without it the harness would run with no skills at all.
See section 7.

### Credentials

`auth.json` and `models.json` are symlinked from `~/.pi/agent/`.
One authentication, shared between the stock config and the harness, and the gpt-5.6 provider setup stays in sync.

**`auth.json` must be gitignored.**
It is a symlink to real credentials, and `.pi-custom-harness` lives inside a git repository.
Add both the symlink and any stray `auth*.json` to `.gitignore` before the first commit.

---

## 6. What is deliberately not here

| Not included | Why |
| --- | --- |
| Auto-discovery of `~/.agents/skills` | Hermetic by decision. Ten skills are re-authored into `skills/` instead, listed in section 9. |
| Subagent roles | Decided in review: none for now. See the open decision in section 7. |
| `AGENTS.md` and `SYSTEM.md` | Neither loads or neither should. `APPEND_SYSTEM.md` is the vehicle, per section 5. |
| The four retired skills | `aircall-dev-flow`, `aircall-dev-flow-maestro`, `gitlab-create-merge-request`, `agent-browser-storybook-dev`. Superseded by modules, per HARNESS.md section 8. |
| A build step | Bun runs `.ts` directly. Adding a bundler would buy startup time at the cost of an edit-reload loop. Revisit only if section 1 cost 2 becomes real. |
| Effect Schema for tool parameters | Impossible. Pi requires typebox `TSchema`. |

---

## 7. Verify before building

Four things I could not confirm from the docs alone, each cheap to settle and each able to change the design.

1. **Cold start with Effect loaded.** Measure `pi` startup before and after the first Effect-based extension. This validates or kills the no-build-step decision.

Three items previously listed here are now closed.

**Context files.**
`--no-context-files` empties every context file including `<configDir>/AGENTS.md`.
Resolved in section 5: the vehicle is `APPEND_SYSTEM.md`, written in phase 8.

**`--no-skills` is blunter than the docs imply.**
Read from `resource-loader.js`:

```js
const skillPaths = this.noSkills
  ? this.mergePaths(cliEnabledSkills, this.additionalSkillPaths)                 // --skill only
  : this.mergePaths([...cliEnabledSkills, ...enabledSkills], this.additionalSkillPaths);
```

`enabledSkills` holds both auto-discovery and the `skills` array from `settings.json`, and `--no-skills` drops the lot.
Only `--skill` CLI paths survive.

So the harness skills directory has to be passed on the command line, not declared in settings.
This is why the abbreviation in section 5 carries `--skill`.
The declarative goal survives, because the abbreviation lives in version-controlled dotfiles alongside the harness, but the path is now in two places and must not drift.

**`pi-subagents` is removed.**
Decided in review: no roles, and the package goes.
No `agents/` directory, no `subagent` or `subagent_wait` tools, and the census drops to 24.
Delegation is a thing you do by opening another session, not a tool in this harness.

---

## 8. Skills to port

Hermetic mode means nothing loads from `~/.agents/skills`.
Ten skills are re-authored into `.pi-custom-harness/skills/`, decided in review.

| Skill | Why it earns a slot |
| --- | --- |
| `write-discoverable-code` | Currently pulled into your AGENTS.md by reference. Applies on every edit. |
| `typescript-best-practices` | Triggers on any `.ts`/`.tsx`, which is 415 of 465 measured edit calls. |
| `aircall-hydra-ui-lib` | `packages/ds` and `packages/blocks` conventions, where 331 edits land. Partly compensates for the repo `AGENTS.md` files lost to hermetic mode. |
| `vercel-react-best-practices` | React performance review. |
| `vercel-composition-patterns` | Component API design. |
| `agent-browser` | Generic browser driving. |
| `agent-browser-aircall-local` | Aircall auth handshake. Referenced by `preview` when `authMode` is `browser-login`. |
| `thermo-nuclear-code-quality-review` | Deep review pass. |
| `grill-me` | Plan stress-testing. |
| `herdr` | Pane and workspace control. |

**Not ported:** `agent-browser-storybook-dev`, retired by the `story` tool, per HARNESS.md section 8.

Porting is a copy plus a review, not a move.
Each skill's description is its trigger, and the measured invocation rate (10 across 5 skills of roughly 50) says most descriptions do not match how requests are actually phrased.
Rewrite each description against a real prompt from the corpus before accepting it into the harness.

---

## 9. Build order

Unchanged from HARNESS.md section 10, with the scaffolding phase added.

| Phase | Ships |
| --- | --- |
| 0 | Directory, `package.json`, `settings.json`, the fish abbreviation, symlinks, `.gitignore`. Settle the open items in section 7. No prompt file yet. |
| 1 | `lib/pi-bridge` and `lib/gitlab`, then `mr-guard`. The first module proves the whole pattern end to end. |
| 2 | `lib/repo-map`, `lib/git`, then `worktree`. |
| 3 | `mr` and `verify`. |
| 4 | `ticket`, then `ship-gate` and `notify-on-settle`. |
| 5 | `lib/portless`, then `preview` and `story`. |
| 6 | `fleet`. |
| 7 | Port the ten skills from section 8, rewriting each description. |
| 8 | **`APPEND_SYSTEM.md`.** Written last, against the modules that exist. See section 10. |

Phase 1 is the one to be careful with.
It establishes the shell-and-core split, the `.purpose` format, the service-layer shape, and the test approach that the other nine modules copy.
Get it wrong and the mistake is replicated nine times.

---

## 10. The prompt is written last

`APPEND_SYSTEM.md` is a downstream artifact, not a starting point.
Writing it before the modules exist produces a generic style document, which is the one thing the harness does not need.

**It cannot be written earlier because its content is defined by subtraction.**
Sources 1, 3 and 4 from section 5 already carry the tool list, the per-tool guidelines, and the skills catalogue.
`APPEND_SYSTEM.md` holds only the remainder, and the remainder is unknowable until you can read what each module already contributes.

### What it must contain

1. **How the modules compose into the loop.** Ticket to worktree to implementation to verify to MR to pipeline. Which tool owns which step, and the handoffs between them. This is the substance, and it is exactly what a generic prompt lacks.
2. **When to reach for a tool rather than bash.** `mr` for MR state, bash for MR creation because `mr-guard` covers it. Non-obvious, and wrong by default.
3. **The invariants that are enforced.** The agent behaves better when it knows a block is an invariant rather than a bug, so it fixes the cause instead of routing around it.
4. **The search-tool condition.** `ffgrep`/`fffind` inside a git repository, built-in `grep`/`find` outside one. HARNESS.md section 3 decided this has to be prose, since keeping both pairs means it cannot be a tool.
5. **Voice and code standards.** Brief answers, no em dash, report what happened. Quality over development cost, no co-author line, never touch `CHANGELOG.md`, one sentence per line in long markdown.
6. **Bug fixing and UI standards.** Reproduce end to end before fixing. Pixel perfection and responsiveness. Fix lint and test failures you did not cause.

Items 5 and 6 carry over from the current Pi `AGENTS.md`, decided in review.
Items 2, 3 and 4 exist only because of decisions in `HARNESS.md`, and item 1 cannot be written until phases 1 through 6 are done.

### What it must not contain

- **A tool list.** Source 3 generates it from each module's `promptSnippet`. Duplicating it guarantees drift.
- **A skills list.** Source 4 generates it.
- **Anything a module already states in its `promptGuidelines`.** Those are injected only while the tool is active, which is strictly better than a static paragraph. Read the assembled prompt before adding a line, and prefer pushing guidance down into the module that owns it.
- **Sections carried over out of habit.** "Before you start digging" and "Reading and searching" were dropped in review. Only the search condition in item 4 survives from the latter.

### How to write it

Run a real session first with everything else in place, dump the assembled prompt with `ctx.getSystemPrompt()`, and read what is already there.
Write only what is missing.
That is the only way to get the subtraction right.
