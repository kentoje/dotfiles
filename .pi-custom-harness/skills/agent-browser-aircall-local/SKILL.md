---
name: agent-browser-aircall-local
description: Authenticate and drive Aircall staging or local development pages through `agent-browser`. Use when the target hostname contains Aircall, including the staging dashboard or a portless `.localhost` worktree URL; prefer this skill over generic browser guidance for those hosts.
---

# Aircall authenticated browser session

Use the `aircall-local` session for ordinary work and a distinct session name per concurrent worker. The authentication integration writes host-scoped cookies, so authenticate against the exact URL you will open.

## URL rules

- Local Aircall development runs behind portless at a stable HTTPS `.localhost` hostname. Discover the worktree URL with `portless list`; do not browse a bare port.
- Staging is `https://dashboard.aircall-staging.com`.
- Include the exact worktree hostname and relevant path in the auth request. Cookies for one host do not authenticate another host.

## Authentication flow

Use the configured Aircall browser-auth integration with the exact target URL, then open and inspect the same URL:

```text
aircall_agent_browser_auth({ url: "<exact URL>" })
```

```bash
agent-browser --session aircall-local open "<exact URL>"
agent-browser --session aircall-local snapshot -i
```

The auth integration sets the Aircall ID and refresh cookies for the requested hostname. Re-authenticate when a JWT expires, a session redirects to login, or the worktree host changes. Do not assume local dev self-authenticates.

## Headed mode

Display mode is fixed when a session daemon first starts. Open once with `--headed`, authenticate, and open the exact URL again to apply cookies:

```bash
agent-browser --session aircall-local open "<exact URL>" --headed
# run aircall_agent_browser_auth for the exact URL
agent-browser --session aircall-local open "<exact URL>"
```

If `--headed` appears ignored, close the existing session and start it again in the requested mode.

## Interaction and parallel work

After every navigation or dynamic page change, take a fresh interactive snapshot; refs shift and stale refs can click the wrong element. Use the generic `agent-browser` skill for command details, screenshots, console/errors, and evidence.

Each session has isolated cookies and storage. The auth integration targets `aircall-local`; for another worker session, export cookies from that authenticated session and import them into the worker session using the CLI's cookie commands. Never share auth-state files or tokens through source control.

## Gotchas and cleanup

- A login page means cookies were missing, host-scoped incorrectly, or expired: authenticate again and reopen.
- A covered element usually means an overlay is open: close it and snapshot again.
- Resolve screenshot paths before passing them to the CLI; do not rely on path normalization.
- Close the session after work: `agent-browser --session <name> close`. After a fan-out, close every worker session.
