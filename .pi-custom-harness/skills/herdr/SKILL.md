---
name: herdr
description: Control the herdr terminal multiplexer through its CLI, including workspaces, tabs, panes, agents, and output waits. Use only when `HERDR_ENV=1` indicates the current session is inside herdr.
---

# herdr

Before using this skill, check that `HERDR_ENV=1`. If it is not `1`, say that the session is not inside a herdr-managed pane and stop. Do not inspect or control a focused herdr pane from outside herdr.

herdr exposes workspaces, tabs, and panes. Each pane is a real terminal running a shell, agent, server, or log stream. Agent status is `idle`, `working`, `blocked`, `done`, or `unknown`; `done` means the finished pane has not necessarily been inspected.

IDs are live-session identifiers: workspace IDs look like `1`, tab IDs like `1:2`, and pane IDs like `1-3`. IDs can compact after closures. Always reread list or create/split responses instead of guessing an old ID.

## Discover and inspect

```bash
herdr pane list
herdr workspace list
herdr tab list --workspace 1
herdr pane read 1-1 --source recent --lines 50
```

`pane read` supports `visible`, `recent`, and `recent-unwrapped`; the unwrapped form matches what `wait output` searches.

## Tabs and workspaces

```bash
herdr tab create --workspace 1 --label "logs"
herdr tab rename 1:2 "logs"
herdr tab focus 1:2
herdr tab close 1:2
herdr workspace create --cwd /path/to/project --label "api"
herdr workspace focus 2
herdr workspace rename 1 "api"
herdr workspace close 2
```

Use `--no-focus` on create operations when the current context must remain focused.

## Split, run, and coordinate

Split a pane, parse the returned `result.pane.pane_id`, then run a command:

```bash
herdr pane split 1-2 --direction right --no-focus
herdr pane run 1-3 "npm run dev"
herdr pane send-text 1-3 "echo ready"
herdr pane send-keys 1-3 Enter
herdr pane close 1-3
```

Use live IDs from the split response; do not assume the example ID remains valid.

Wait for output or an agent status rather than polling:

```bash
herdr wait output 1-3 --match "server.*ready" --regex --timeout 30000
herdr wait agent-status 1-1 --status done --timeout 60000
herdr pane read 1-3 --source recent-unwrapped --lines 40
```

An output wait timeout exits with status `1`; inspect the pane before deciding whether to retry.

## Safe recipes

For a server: split with `--no-focus`, run it in the new pane, wait for a specific readiness line, then read recent output. For another agent: list panes, wait for its target status, and read its recent output. Close temporary panes, tabs, and workspaces when finished.
