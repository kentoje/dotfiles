---
name: agent-browser-aircall-local
description: >
  Browse Aircall staging or local dev URLs with automatic authentication.
  USE THIS skill (not the generic agent-browser skill) whenever the target URL
  contains "aircall" in the hostname (e.g. dev.aircall-staging.com, localhost running Aircall).
---

# Agent Browser — Aircall Authenticated Session

Authenticates via cookies and opens an `agent-browser` session. **Always use `--session aircall-local`** for all commands.

## Flow

### Headed mode (if user requests `--headed`)

The daemon display mode is set on first launch. Open the browser first, then set cookies, then reload.

```bash
# 1. Start daemon in headed mode (lands on login page — that's expected)
agent-browser --session aircall-local open "<URL>" --headed

# 2. Set auth cookies (MCP tool)
# Claude Code:
mcp__aircall-personal-tools__aircall_persist_browser_auth({ url: "<URL>" })
# OpenCode:
AircallPersistBrowserAuth({ url: "<URL>" })

# 3. Reload to apply cookies
agent-browser --session aircall-local open "<URL>"
```

### Headless mode (default)

```bash
# 1. Set auth cookies (MCP tool)
# Claude Code:
mcp__aircall-personal-tools__aircall_persist_browser_auth({ url: "<URL>" })
# OpenCode:
AircallPersistBrowserAuth({ url: "<URL>" })

# 2. Navigate
agent-browser --session aircall-local open "<URL>"
```

### Then snapshot & interact

```bash
agent-browser --session aircall-local snapshot -i
```

Use refs (`@e1`, `@e2`, etc.) to interact. Re-snapshot after every page change.

## Cleanup

```bash
agent-browser --session aircall-local close
```

## Troubleshooting

- **Login page shown** — Cookies weren't set or expired. Re-run the MCP tool and reload.
- **`--headed` ignored** — The daemon was already running. Close it first: `agent-browser close`, then restart.
