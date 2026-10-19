---
name: agent-browser-aircall-local
description: >
  Browse Aircall staging or local dev URLs with automatic authentication.
  USE THIS skill (not the generic agent-browser skill) whenever the target URL
  contains "aircall" in the hostname (e.g. dashboard.aircall-staging.com, localhost running Aircall).
---

# Agent Browser — Aircall Authenticated Session

Drives an `agent-browser` session against an Aircall URL.
Session name is the `--session <NAME>` arg: use **`aircall-local`** for normal work, a **distinct name
per worker** for parallel agents.

## URLs come from portless, never a bare port

Local Aircall dev servers run behind the portless proxy at a stable `.localhost` host —
`https://<worktree>.<project>.localhost`. Get it with `portless list`. Don't browse `localhost:<port>`.
Staging is `https://dashboard.aircall-staging.com`.

## Auth — detect the repo's dev plugin first

**Staging** (`*.aircall-staging.com`): no local plugin. Always inject cookies (below).

**Local sandbox** (portless `.localhost`): the dev server may already authenticate the browser.
Check the repo that owns the URL before opening it. Do not inject cookies when the plugin is present —
a pre-set `ac-auth.id-token` makes the plugin skip auto-login, so a foreign or expired JWT wins and
breaks the session the server would have set.

Look for a dev-only server plugin that fetches a staging session and sets `ac-auth.id-token` /
`ac-auth.refresh-token` on the requesting host. In conversation-center-ext that is
`build/dev-auth.ts`, wired via `setupDevAuthMiddlewares` in `rsbuild.config.ts` (`dev.setupMiddlewares`
only — never in a production build). Confirm the wiring is actually registered, not just that the file
exists. Another repo may use the same shape under a different path; search the repo, don't assume this
filename.

- **Plugin wired:** open the URL. The first HTML navigation auto-logs in when
  `AIRCALL_STAGING_EMAIL` / `AIRCALL_STAGING_PASSWORD` are in the dev server's environment. Do not call
  the MCP auth tool. Do not click a sandbox SSO gate. If the page is still the staging login, the plugin
  failed (missing creds, or it already set the short-lived `ac-auth.dev-login-tried` cookie) — open
  `/__dev-login` on that same host for the upstream error, or clear cookies and reload. Fall back to MCP
  injection only after that fails.
- **No plugin:** fall back to MCP cookie injection.

### MCP fallback (staging, or local with no dev-auth plugin)

```
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
```

Writes `ac-auth.id-token` + `ac-auth.refresh-token` **scoped to the hostname of the URL you pass**.
The app reads those cookies. Pass the exact URL you will open, including the worktree subdomain.
Host must match, or the app finds no cookie and redirects to the staging login. Cookies are host-only
and the JWT expires → re-auth per worktree host and when a session goes stale. The MCP tool only ever
writes to session `aircall-local`. For another session, propagate (see Parallel).

`PUBLIC_SANDBOX_EMAIL` / `PUBLIC_SANDBOX_PASSWORD` in `.env.local` are not a substitute for either
path. Do not assume the sandbox self-authenticates from those.

## Flow

Plugin present (local only):

```bash
agent-browser --session aircall-local open "<URL>"
agent-browser --session aircall-local snapshot -i
```

No plugin, or staging — auth, then open, then snapshot (re-snapshot after every page change):

```bash
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
agent-browser --session aircall-local open "<URL>"
agent-browser --session aircall-local snapshot -i
```

**Headed** (`--headed`): display mode is fixed at first launch. With the plugin, open headed once —
the server sets cookies on that navigation. Without it, open first, then auth, then reopen:

```bash
agent-browser --session aircall-local open "<URL>" --headed   # login page expected only without the plugin
mcp__aircall-personal-tools__aircall_agent_browser_auth({ url: "<URL>" })
agent-browser --session aircall-local open "<URL>"            # cookies now applied
```

## Parallel / multiple sessions

Each `--session <NAME>` is an independent browser context (own cookies); concurrent agents need
**distinct** names or they clobber each other. The dev-auth plugin authenticates whichever session
opens the URL, so a worker can open directly. The MCP tool only auths `aircall-local`; when using
the fallback, propagate:

```bash
agent-browser --session aircall-local cookies get > /tmp/aircall-cookies.json
agent-browser --session <worker> cookies set --curl /tmp/aircall-cookies.json   # then open
```

## Gotchas

- **`--headed` ignored** — a daemon for that session is already running; `agent-browser --session <NAME> close`, then reopen.
- **`Element is covered by <div…>`** — a popup/drawer overlay is open; close it, and grab a fresh ref after each snapshot (refs shift).
- **Screenshots** — pass a fully-resolved ABSOLUTE path; it's used literally (no `/../` collapsing).
- **Cleanup** — `agent-browser --session <NAME> close`, or `agent-browser close --all` after a fan-out.
