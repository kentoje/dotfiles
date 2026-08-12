# Agent roles

One role definition, two consumers.
A role is a persona plus the machinery that makes the persona real: a model tier, a skill
set, and a tool set it physically cannot exceed.

**The main way roles are used is delegation.** `pi-subagents` scans `~/.agents/**/*.md`
recursively, so these files are discovered as subagents with no registration step. In a
normal pi session you say "use code-reviewer on this diff" or "run ui-reviewer and
code-reviewer in parallel" and it spawns a child session with that model, thinking level,
skill set and tool allowlist.

`pi-role <name>` is the second consumer: it launches a role as your own session, for when
you want to argue with the architect rather than delegate to it.

The builtin pi-subagents agents are switched off in `~/.pi/agent/settings.json`:

```json
"subagents": { "disableBuiltins": true }
```

Their `scout` / `worker` / `reviewer` overlapped ours almost exactly, and a delegating
agent choosing between two similar-sounding scouts is the ambiguity worth removing. The
cost is losing `oracle` and `researcher`, which have no equivalent here yet.

Roles live in `~/.agents/` rather than inside either agent's config, so a Claude Code
adapter can read the same files later.

## Discovery is not advertisement

Being discovered is not the same as being known about. `pi-subagents` builds the
`subagent` tool description from a static string (`buildSubagentToolDescription`, wired in
at `src/extension/index.ts:542`) that never names the discovered agents - it only repeats
"call `{ action: "list" }` first". So a delegating model sees the tool and the whole
`workflowScript` grammar, but has no idea `scout` or `code-reviewer` exist until it spends
a call to find out, and nothing suggests it should.

The roster therefore also lives in `~/.pi/agent/AGENTS.md`, as one line per role plus a
permissive "worth considering" policy. That file is deliberately name-and-purpose only:
models, thinking levels, tool allowlists and `hostOnly` stay here, because they change and
a duplicated copy would drift. `{ action: "list" }` remains authoritative, and the table
there says so.

`pi-subagents` also supports a `subagent-tool-description.md` in the agent dir with
`toolDescriptionMode: "custom"` (a `{{full}}` placeholder keeps the stock mechanics), which
would put the roster at the point of decision rather than in general instructions. Not used
yet - the failure it would fix is choosing the wrong role, and the observed failure is not
delegating at all.

## Why `~/.agents/commands/.agents/` exists

`pi-subagents` scans `~/.agents` recursively for `*.md` and has no ignore mechanism, so
slash commands, which also carry `name` and `description` frontmatter, parse as valid
agents and appear as things the model can delegate to. A command is a prompt a human
invokes, not an agent.

The scanner prunes any subdirectory containing a `.agents` directory, treating it as a
nested agents root (`shouldPruneDiscoveryDir` in `pi-subagents/src/agents/agents.ts`). So
an empty `.agents` directory inside `commands/` is enough to skip the whole tree. It holds
a `.keep` because git does not track empty directories.

Two details that matter if this ever needs redoing: a `.pi` directory would prune the same
way but marks a pi *project root*, which could change settings resolution for anything
running inside; and the keep file must not be a `.md`, or Claude Code lists it as a slash
command, which is the same pollution in the other harness.

Verified: with the marker, discovery returns exactly the six roles. Without it,
`radical-addition` appears alongside them.

## Format

The frontmatter is `pi-subagents`' schema, because it is the stricter of the two and the
one that runs unattended. `pi-role` adapts it to pi flags.

```yaml
---
name: ui-reviewer
description: One line, shown when an agent or a human lists roles
model: llmgateway/azure/gpt-5.6-terra
thinking: high
skills:
  - agent-browser
  - agent-browser-storybook-dev
tools:
  - read
  - ls
  - bash
  - grep
  - find
  - contact_supervisor
hostOnly: true          # needs a browser and a dev server, cannot be sandboxed
---

The role prompt.
```

| Field | Delegated | `pi-role` |
| --- | --- | --- |
| `model` | child's model | `--provider` + `--model`, split at the first slash |
| `thinking` | child's thinking level | `--thinking` |
| `skills` | exactly these, `inheritSkills` off | `--no-skills` plus one `--skill` per entry |
| `tools` | allowlist, nothing else exists | `--tools a,b,c` |
| `extensions` | extension to load in the child, e.g. `npm:@ff-labs/pi-fff` | ignored, the session already has it |
| body | appended to the child's system prompt | `--append-system-prompt` |

Use block lists, not inline `[a, b]`: both parsers handle block lists, and an inline empty
`[]` parses as the literal string `"[]"`.

## Three rules that are easy to get wrong

**`tools` is an allowlist, and it is the only enforcement.** `pi-subagents` has no
`excludeTools`, so a denylist would be silently ignored and a "read-only" reviewer would
happily edit files. Every non-building role lists read, ls, bash, grep, find and nothing
that writes. `bash` stays, because search, `git diff` and `agent-browser` all need it.

**Never list a tool that is not registered.** A subagent whose allowlist names a missing
tool completes its work and is then marked failed. `fff-multi-grep` is the trap here: it
only registers when `PI_FFF_MULTIGREP=1`, so scout lists `ffgrep` and `fffind` only.

**Extension tools do not come for free in a child.** A delegated subagent does not inherit
the parent's extension tools; the tool must be named in `tools` *and* its provider loaded
via `extensions`. That is why scout carries `extensions: [npm:@ff-labs/pi-fff]`.

**Roles run against the default agent dir.** They are flag bundles over plain `pi`, not
separate `PI_CODING_AGENT_DIR` profiles. That matters: `@ff-labs/pi-fff` is a package in
the default profile, so scout gets FFF search only because the role does not swap the
profile out. Swapping the agent dir would silently remove it, and the symptom would look
like a model that could not be bothered to search.

The RLM profile is the exception, and there a role degrades to prompt plus model: skills
are invisible and there is only one tool.

## Skills a role must read rather than list

`thermo-nuclear-code-quality-review` sets `disable-model-invocation: true`, so pi excludes
it from the skill catalogue it puts in the prompt.
Listing it under `skills:` would load the file and change nothing the model can see.
The only mechanism that works is the role prompt naming the path and telling the model to
read it, which is what `code-reviewer.md` does.

## The set

| Role | Job | Model | Writes? |
| --- | --- | --- | --- |
| `scout` | Where is X, what exists, what calls this | luna | no |
| `architect` | How should this be shaped. Also diagnosis | sol | no |
| `builder` | Execute an agreed plan | luna | yes |
| `ui-reviewer` | Does the render match the goal | terra | no |
| `motion-reviewer` | Does it move well | terra | no |
| `code-reviewer` | Diff correctness and structural quality | sol | no |

Diagnosis lives with the architect, not the builder.
Reproducing a bug, forming a hypothesis, and minimising it is the highest-judgment work in
the loop and it needs no write access; the builder then executes the fix from a diagnosis
it did not have to derive.
