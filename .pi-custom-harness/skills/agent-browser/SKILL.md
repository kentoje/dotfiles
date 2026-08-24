---
name: agent-browser
description: Drive a real browser through the `agent-browser` CLI for navigation, interaction, visual evidence, and data extraction. Use when testing a web surface, filling a form, capturing screenshots or video, inspecting accessibility, or debugging browser behavior.
---

# Browser automation with agent-browser

Use the installed `agent-browser` CLI directly. Keep browser state in a named session when work may overlap with another task.

## Core loop

```bash
agent-browser open <url>
agent-browser snapshot -i
agent-browser click @e1
agent-browser fill @e2 "text"
agent-browser close
```

1. Open the exact URL.
2. Take an interactive snapshot (`snapshot -i`) before acting.
3. Use the returned `@eN` references or semantic locators.
4. Re-snapshot after navigation, overlays, or meaningful DOM updates; refs are invalidated by page changes.
5. Exercise the behavior, then capture the relevant output and close the session.

## Navigation and interaction

```bash
agent-browser back
agent-browser forward
agent-browser reload
agent-browser click @e1
agent-browser dblclick @e1
agent-browser focus @e1
agent-browser fill @e2 "value"
agent-browser type @e2 "value"
agent-browser press Enter
agent-browser hover @e1
agent-browser check @e1
agent-browser uncheck @e1
agent-browser select @e1 "value"
agent-browser scroll down 500
agent-browser scrollintoview @e1
agent-browser drag @e1 @e2
agent-browser upload @e1 ./file.pdf
```

For stable elements, semantic locators are often clearer: `find role button click --name "Submit"`, `find label "Email" fill "$EMAIL"`, `find text "Sign In" click --exact`, and `find testid "submit-btn" click`.

## Inspect and wait

```bash
agent-browser get text @e1
agent-browser get html @e1
agent-browser get value @e1
agent-browser get attr @e1 href
agent-browser get title
agent-browser get url
agent-browser get count ".item"
agent-browser is visible @e1
agent-browser is enabled @e1
agent-browser wait --load networkidle
agent-browser wait --text "Success"
agent-browser wait --url "**/dashboard"
agent-browser wait --fn "window.ready === true"
```

Use `--json` for output that another command must parse. Inspect `console` and `errors` when debugging. Use `frame <selector>` and `frame main` for iframes.

## Evidence and settings

```bash
agent-browser screenshot ./artifacts/result.png
agent-browser screenshot --full ./artifacts/page.png
agent-browser pdf ./artifacts/page.pdf
agent-browser record start ./artifacts/flow.webm
agent-browser record stop
agent-browser set viewport 1920 1080
agent-browser set media light reduced-motion
```

Use an absolute, resolved screenshot path when the CLI requires one. Respect reduced-motion when testing accessibility or motion-sensitive UI.

## Sessions, state, and auth

Use `--session <name>` for isolated cookies, storage, tabs, and history. Save and load state only in local, ignored paths; never commit tokens.

```bash
agent-browser --session app open https://app.example.com/login
agent-browser --session app state save ./app.auth-state.json
agent-browser --session app state load ./app.auth-state.json
agent-browser session list
agent-browser --session app close
```

Use environment variables for credentials. Prefer the target site's normal login flow or a repository-provided authentication integration; never put secrets in skill text or scripts.

## Troubleshooting

- Ref not found or covered: take a fresh snapshot, close overlays, and retry with the new ref.
- Login redirects: inspect the current URL and re-authenticate for the exact host.
- Local/self-signed HTTPS: use the CLI's documented certificate-error option only for a controlled test.
- CDP/debugging: `agent-browser connect <port>`, then inspect with `snapshot`, `console`, `errors`, and `highlight`.
- Close sessions when finished, including parallel sessions.
