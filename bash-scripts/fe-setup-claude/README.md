# FE Setup for Claude Code

One-command setup for frontend engineers using Claude Code. Installs and configures browser automation, Aircall staging auth, and visual feedback tools.

## Install

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/kentoje/dotfiles/main/bash-scripts/fe-setup-claude/bootstrap.sh)
```

No prerequisites — the script installs everything it needs (bun, Claude Code, etc.).

## What gets installed

| Tool | Type | What it does |
|---|---|---|
| [agent-browser](https://github.com/vercel-labs/agent-browser) | CLI | Browser automation — navigate, snapshot, click, fill forms, screenshot |
| aircall-personal-tools | MCP server | Authenticates against Aircall staging and sets browser cookies |
| [agentation-mcp](https://agentation.dev/mcp) | MCP server | Visual feedback annotations for AI coding agents |
| agent-browser | Skill | Teaches Claude the snapshot → interact workflow |
| agent-browser-aircall-local | Skill | Aircall-specific auth flow using agent-browser |
| agentation-self-driving | Skill | Autonomous design critique mode with headed browser |

## How it works

The setup is fully interactive. It asks before every step and never overwrites existing config without permission.

```
── Preflight checks ──
  ✓ bun 1.3.11
  ? Install Claude Code now? [Y/n]

── agent-browser ──
  ✓ agent-browser 0.21.4 already installed
  ? Upgrade to latest version? [Y/n]
  ? Run 'agent-browser install' to download Chrome for Testing? [Y/n]

── Aircall Personal Tools MCP ──
  ? Set up the Aircall staging auth MCP server? [Y/n]
  ? Aircall staging email: you@aircall.io
  ? Aircall staging password: ********

── agentation-mcp ──
  ? Set up agentation (visual feedback annotations)? [Y/n]
  ? Choose scope [1/2]: 1  (Global / Project)
```

### Re-running

Safe to run multiple times. On re-runs it detects existing installations and asks before overwriting:

```
  ! Aircall MCP is already fully configured.
  ? Reconfigure it? [Y/n] n
  ℹ Keeping existing Aircall MCP setup
```

### Credentials

No credentials are stored in files. The Aircall MCP server reads `AIRCALL_EMAIL` and `AIRCALL_PASSWORD` from environment variables at runtime. The setup script captures them once and passes them to `claude mcp add -e` so Claude Code injects them when launching the server.

## Testing

```bash
docker build -t fe-setup-claude .
docker run --rm fe-setup-claude ./test.sh        # Smoke + conflict tests
docker run -it --rm fe-setup-claude ./setup.sh    # Interactive walkthrough
docker rmi fe-setup-claude                        # Cleanup
```
