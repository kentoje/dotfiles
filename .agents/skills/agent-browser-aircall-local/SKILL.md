---
name: agent-browser-aircall-local
description: >
  Browse Aircall staging or local dev URLs with automatic authentication.
  USE THIS skill (not the generic agent-browser skill) whenever the target URL
  contains "aircall" in the hostname (e.g. dashboard.aircall-staging.com, localhost running Aircall).
---

# Agent Browser — Aircall Authenticated Session

Drives an `agent-browser` session against an Aircall URL, authenticated by injecting auth cookies.
Session name is the `--session <NAME>` arg: use **`aircall-local`** for normal work, a **distinct name
per worker** for parallel agents.

## URLs come from portless, never a bare port

Local Aircall dev servers run behind the portless proxy at a stable `.localhost` host —
`https://<worktree>.<project>.localhost`. Get it with `portless list`. Don't browse `localhost:<port>`.
Staging is `https://dashboard.aircall-staging.com`.

## Auth — always, against the exact host you'll browse

```
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
```

This fetches staging JWTs and writes `ac-auth.id-token` + `ac-auth.refresh-token` cookies **scoped to
the hostname of the URL you pass**. The Aircall app — staging AND local sandbox dev — reads those
cookies to authenticate. So:

- **Pass the exact URL you will open**, including the worktree subdomain
  (`https://<worktree>.conversations-center-ext.localhost/...`). Host must match, or the app finds no
  cookie and redirects to the staging login.
- **Do not assume sandbox dev self-authenticates.** It only does when `PUBLIC_SANDBOX_EMAIL/PASSWORD`
  are in `.env.local`, which they usually are NOT — always run this auth step.
- Cookies are host-only and the JWT expires → **re-auth per worktree host** and when a session goes stale.
- The MCP tool only ever writes to session `aircall-local`. For another session, propagate (see Parallel).

## Flow

```bash
# 1. auth against the URL  →  2. open  →  3. snapshot/interact (re-snapshot after every page change)
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
agent-browser --session aircall-local open "<URL>"
agent-browser --session aircall-local snapshot -i
```

**Headed** (`--headed`): display mode is fixed at first launch, so open first, then auth, then reopen:
```bash
agent-browser --session aircall-local open "<URL>" --headed   # lands on login — expected
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
agent-browser --session aircall-local open "<URL>"            # cookies now applied
```

## Parallel / multiple sessions

Each `--session <NAME>` is an independent browser context (own cookies); concurrent agents need
**distinct** names or they clobber each other. The MCP tool only auths `aircall-local`, so propagate:
```bash
agent-browser --session aircall-local cookies get > /tmp/aircall-cookies.json
agent-browser --session <worker> cookies set --curl /tmp/aircall-cookies.json   # then open
```

## Gotchas

- **`--headed` ignored** — a daemon for that session is already running; `agent-browser --session <NAME> close`, then reopen.
- **`Element is covered by <div…>`** — a popup/drawer overlay is open; close it, and grab a fresh ref after each snapshot (refs shift).
- **Screenshots** — pass a fully-resolved ABSOLUTE path; it's used literally (no `/../` collapsing).
- **Cleanup** — `agent-browser --session <NAME> close`, or `agent-browser close --all` after a fan-out.
