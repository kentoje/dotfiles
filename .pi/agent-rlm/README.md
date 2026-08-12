# Experimental pi profile: RLM mode

`pi` has no `--settings <path>` flag, but `PI_CODING_AGENT_DIR` swaps the whole agent
directory - including which `packages` load.
This directory is that second profile, selected by the `pii` fish abbr.

RLM mode (`--rlm`, from `npm:@shift-labs/pi-rlm`) calls `pi.setActiveTools(["execute"])`
at `session_start`, so the model's only tool is `execute`: TypeScript cells in a
persistent Bun evaluator.
Every other tool - built-in, extension, and MCP - is deactivated, which is why this
profile's `packages` list is a trimmed subset of the default one.

## Bootstrap on a new machine

Tracked here: `settings.json`, `AGENTS.md`, `docs/`, `lib/`, and this README.
Everything else is a symlink back to the default profile so credentials, the model
catalogue, MCP servers and installed packages are shared rather than duplicated:

```sh
mkdir -p ~/.pi/agent-rlm
cd ~/.pi/agent-rlm
for f in auth.json models.json mcp.json keybindings.json themes npm git; do
  ln -s "../agent/$f" "$f"
done
for f in settings.json AGENTS.md docs lib; do
  ln -sfn ~/dotfiles/.pi/agent-rlm/"$f" "$f"
done
cp ~/.pi/agent/models-store.json models-store.json
```

`models-store.json` is deliberately a copy, not a link.
pi writes it through `writeFileSync` while holding a lockfile created next to the path
it was given, so two profiles sharing the target would not share the lock.
It is only a fetched catalogue, so a private copy costs nothing.
`auth.json` stays shared - re-authenticating a second profile is worse than the narrow
write race, and the gateway provider reads a static key from `$LLM_GATEWAY_KEY` anyway.

## AGENTS.md, not SYSTEM.md

`SYSTEM.md` and `APPEND_SYSTEM.md` have no effect under `--rlm`.
pi builds the base prompt first, then `before_agent_start` handlers may replace it, and
pi-rlm replaces it wholesale - `agent-session.js` assigns `result.systemPrompt` over
`_baseSystemPrompt`, discarding whatever those files contributed.
Verified: a `SYSTEM.md` marker fires in a plain session on this profile and is ignored
with `--rlm`.

`AGENTS.md` is the one channel that survives, because pi-rlm reads
`systemPromptOptions.contextFiles` and re-inserts them into its own prompt.
So the RLM playbook lives in `AGENTS.md`, kept short, pointing at `docs/`.

## What the profile adds back

RLM also drops the skill catalogue, which is how the agent used to learn these
workflows. `AGENTS.md` replaces that index:

- `docs/web-research.md` - `lib/web-search-and-fetch.ts`, the web tools as plain functions
- `docs/browser-automation.md` - agent-browser via `Bun.$`, screenshots via `tools.read`, Aircall auth
- `docs/mcp-without-tools.md` - importing local MCP servers' exported functions
