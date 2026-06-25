---
name: agent-browser-aircall-local
description: >
  Browse Aircall staging or local dev URLs with automatic authentication.
  USE THIS skill (not the generic agent-browser skill) whenever the target URL
  contains "aircall" in the hostname (e.g. dashboard.aircall-staging.com, localhost running Aircall).
---

# Agent Browser — Aircall Authenticated Session

Authenticates via cookies and drives an `agent-browser` session. The session name is a
**parameter** (`--session <NAME>`): use **`aircall-local`** for ordinary single-task work, and a
**distinct session name per worker** when several agents browse **in parallel** (see "Parallel /
multiple sessions"). All commands take `--session <NAME>`.

> **Local dev URLs come from `portless`, never a bare port.** Local Aircall dev servers run through
> the portless proxy, so the URL is a stable `.localhost` — e.g. `https://<branch>.<project>.localhost`
> in a worktree. Get it with `portless list` (or `portless get <project>`). Don't browse
> `localhost:<port>`. Staging (`https://dashboard.aircall-staging.com`) is a normal https URL.

## Auth (MCP tool)

Set cookies with the MCP tool — it writes them onto the **`aircall-local`** session:

```
# Claude Code:
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
```

It takes only `url` (no session arg) and always targets `aircall-local`. To auth a *different*
session, propagate the cookies (see "Parallel / multiple sessions").

## Flow (default — session `aircall-local`)

### Headless (default)
```bash
# 1. Auth (sets cookies on aircall-local)
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
# 2. Navigate
agent-browser --session aircall-local open "<URL>"
# 3. Snapshot & interact (refs @e1, @e2…; re-snapshot after every page change)
agent-browser --session aircall-local snapshot -i
```

### Headed (if the user asks `--headed`)
Display mode is fixed at first launch — open first, then auth, then reload:
```bash
agent-browser --session aircall-local open "<URL>" --headed   # lands on login — expected
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
agent-browser --session aircall-local open "<URL>"            # reload applies cookies
```

## Aircall specifics (read these — they bite)

- **Sandbox dev shows a "Sandbox SSO → Continue" interstitial FIRST.** A standalone sandbox dev URL
  (`https://<branch>.conversations-center-ext.localhost/…`) self-authenticates via
  `PUBLIC_SANDBOX_EMAIL/PASSWORD`, but only **after** you click a "Continue" button on an SSO screen.
  Snapshot, find "Continue", click it, THEN poll (~20–40s) until real data loads. An unattended agent
  that skips this just sees a spinner forever (it is NOT a data/schema problem).
- **Sandbox dev needs NO cookie auth** — it logs itself in. The MCP cookie auth is for **staging**
  (and other host URLs). So a local-sandbox-only session can skip the MCP tool entirely.
- **staging = host + remotes; sandbox = the remote alone.** When comparing a migrated extension to
  staging, compare the **extension's content** (its components), not the surrounding dashboard chrome.
- **Open popups/drawers cover the page.** Once a drawer/modal/dropdown is open, its backdrop overlay
  intercepts clicks on the elements behind it (`Element is covered by <div…>`). CLOSE it before
  re-clicking, and grab a **fresh ref** after each `snapshot` (refs shift between snapshots).
- **Screenshots: pass a fully-resolved ABSOLUTE path.** `agent-browser screenshot <path>` takes the
  path literally — a `/../` in it is NOT collapsed, so files land somewhere unexpected.

## Parallel / multiple sessions

Each `--session <NAME>` is an **independent browser context** (separate cookies/storage), so concurrent
agents must each use a **distinct** name (sharing one name = one browser = they clobber each other's
navigation). Ports/URLs are not the constraint — portless already gives each worktree a distinct URL;
the **session name** is.

- **Local sandbox only (no staging):** distinct session per worker, no auth needed —
  `agent-browser --session <worker> open "<localUrl>"`. Fully parallel-safe.
- **Need staging (or host) cookies in a parallel session:** the MCP tool only auths `aircall-local`, so
  **auth once and propagate** the cookies to each worker session:
  ```bash
  # once:
  mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "https://dashboard.aircall-staging.com" })
  agent-browser --session aircall-local cookies get > /tmp/aircall-cookies.json
  # per worker session:
  agent-browser --session <worker> cookies set --curl /tmp/aircall-cookies.json
  agent-browser --session <worker> open "https://dashboard.aircall-staging.com/…"
  ```
  (`cookies set` auto-detects JSON/cURL/Cookie-header files via `--curl`.)
- **Better for fan-outs:** staging UI is stable prod — capture staging **reference screenshots once**
  and have parallel workers compare their local screenshot against the stored reference, so no worker
  needs staging auth at all.

## Cleanup

```bash
agent-browser --session <NAME> close      # one session
agent-browser close --all                 # every session (use after a parallel fan-out)
```

## Troubleshooting

- **Login page shown** — cookies not set/expired (or wrong session). Re-auth and reload; for a custom
  session, re-propagate cookies.
- **Spinner forever on local sandbox** — you skipped the "Sandbox SSO → Continue" click (see above).
- **`--headed` ignored** — the daemon for that session is already running; `agent-browser --session <NAME> close` then restart.
- **`Element is covered by <div…>`** — a popup/drawer overlay is open; close it and use a fresh ref.
