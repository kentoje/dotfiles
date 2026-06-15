---
name: agent-browser-storybook-dev
description: >
  Drive agent-browser against a locally-running Storybook to inspect, screenshot,
  and debug a single component in isolation. USE THIS skill (not the generic
  agent-browser skill) whenever the target is a Storybook dev server — e.g.
  @aircall/ds (:6008) or @aircall/blocks (:6009) in the Hydra monorepo. Renders
  one story via the preview iframe so the manager chrome (sidebar, toolbar,
  addons panel) is never in the way. Triggers on "inspect/debug a story",
  "screenshot a component in Storybook", or component work that needs a live render.
allowed-tools: Bash(agent-browser:*)
---

# Agent Browser — Storybook component dev

Inspect/debug one component at a time on a running Storybook, without the manager UI.

## The key idea: hit the preview iframe, not the manager

Storybook serves two surfaces:

| URL                                                               | What renders                                                                                                                             |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost:<port>/`                                        | **Manager** — sidebar nav, toolbar, addons panel + the story                                                                             |
| `http://localhost:<port>/iframe.html?id=<storyId>&viewMode=story` | **Preview iframe** — ONLY the story canvas (with the package's global decorators: theme/font providers). No sidebar, toolbar, or addons. |

Always point agent-browser at the **iframe URL**. That answers "render only the current
component" — the manager chrome is gone, you get just the component (plus whatever providers
`.storybook/preview` wraps every story in, which you usually want).

> `viewMode=story` = the single rendered story. `viewMode=docs` = the autodocs page. Use `story`.

## Ports (Hydra packages)

| Package            | Port | Start (Hydra root)                                    |
| ------------------ | ---- | ----------------------------------------------------- |
| `@aircall/ds`      | 6008 | `pnpm sb:dev:ds` (or `cd packages/ds && pnpm sb:dev`) |
| `@aircall/blocks`  | 6009 | `pnpm sb:dev:blocks`                                  |
| `@aircall/aw-ui`   | 6007 | —                                                     |
| `@aircall/tractor` | 6006 | —                                                     |

Storybook must already be running (long-lived). See `aircall-hydra-ui-lib` →
`rules/debug-blocks.md` for the blocks dev-server workflow.

## Finding the story ID

The id is `slug(meta.title)` + `--` + `slug(story name)`, where `slug` lowercases and
replaces runs of non-alphanumerics with a single `-`. ⚠️ It does **not** split camelCase:
`Utilities/CopyButton` → `utilities-copybutton` (NOT `copy-button`), story `Icon Only` →
`icon-only`, so the full id is `utilities-copybutton--icon-only`.

Because of that camelCase gotcha, **don't guess — list them from the server's manifest:**

```bash
agent-browser open "http://localhost:6009/index.json"
agent-browser get text body            # JSON: { entries: { "<id>": { title, name, type } } }
# or fetch directly:
curl -s http://localhost:6009/index.json | jq '.entries | keys'
```

Filter to `type == "story"` (skip `"docs"` entries).

## Workflow

Use a dedicated session so it doesn't collide with other browsing:

```bash
# 1. Open the isolated story
agent-browser --session storybook open \
  "http://localhost:6009/iframe.html?id=utilities-copybutton--left-icon-with-label&viewMode=story"

# 2. Wait for the story to mount, then snapshot
agent-browser --session storybook wait --fn "document.querySelector('#storybook-root')?.children.length > 0"
agent-browser --session storybook snapshot -i

# 3. Interact via @refs from the snapshot, re-snapshot after DOM changes
agent-browser --session storybook click @e1

# 4. Screenshot just the component
agent-browser --session storybook screenshot "#storybook-root" story.png
```

The mount point is `#storybook-root` (Storybook 7+). Scope to it to capture only the
component. **Mind the arg shapes — they differ between commands:**

- `screenshot [selector] [path]` — selector is a **positional** arg, then the path:
  `screenshot "#storybook-root" story.png`. (There is **no** `-s` flag here; passing `-s`
  silently writes a file literally named `-s`.)
- `snapshot -s "#storybook-root"` — snapshot **does** take `-s`/`--scope` as a flag.

## Dark mode / theme

Theme is a Storybook global (`withThemeByDataAttribute`, sets `data-theme` on the root,
default `light`). Force it from the URL — no toolbar needed:

```bash
# dark
…/iframe.html?id=utilities-copybutton--left-icon-with-label&viewMode=story&globals=theme:dark
# light (default)
…/iframe.html?id=utilities-copybutton--left-icon-with-label&viewMode=story&globals=theme:light
```

(`globals=key:value`; multiple separated by `;`.)

## Debugging (the point of this skill)

```bash
agent-browser --session storybook console          # console.log/warn/error from the story
agent-browser --session storybook console --clear   # clear before reproducing
agent-browser --session storybook errors            # uncaught page errors / React throws
agent-browser --session storybook eval "getComputedStyle(document.querySelector('[data-slot=button]')).backgroundColor"
agent-browser --session storybook get styles @e1     # font/color/bg/spacing of an element
agent-browser --session storybook highlight @e1      # visually outline an element
```

Typical loop: reload story → `console --clear` → reproduce the interaction → `errors` +
`console` to read what broke → inspect with `get styles` / `eval`.

## Args / controls via the URL

Override a story's args without touching the toolbar:

```bash
…/iframe.html?id=utilities-copybutton--playground&viewMode=story&args=variant:ghost
```

## Viewport

```bash
agent-browser --session storybook set viewport 1280 800
```

## Cleanup

```bash
agent-browser --session storybook close
```

## Troubleshooting

- **Blank canvas** — story still mounting; `wait --fn "document.querySelector('#storybook-root')?.children.length > 0"` or `wait --load networkidle`, then re-snapshot.
- **404 / "Story not found"** — wrong id. Re-derive from `index.json`; confirm it's a `story` not a `docs` entry.
- **Manager chrome still visible** — you opened `/` or `/?path=/story/...`. Use `/iframe.html?...` instead.
- **Connection refused** — the dev server isn't running. Start it (`pnpm sb:dev:blocks`) and wait for "Storybook started".
- **Theme won't change** — confirm `&globals=theme:dark` (not `?theme=`); it's a Storybook global, applied as `data-theme` on the root.
- **Stale component state across reopens** — re-`open`ing in the same session can keep the
  previous render's interactive state (e.g. a CopyButton stuck on "Copied" after an earlier
  click), so a screenshot captures the wrong state. For a deterministic capture: `reload`
  the story first, or use a fresh `--session`, or `wait` for the reset state before shooting
  (e.g. `wait --fn "/Copy$/.test(document.querySelector('[data-slot=button]')?.textContent)"`).

## Related skills

- `agent-browser` — the full agent-browser command reference (snapshot refs, sessions, network, etc.).
- `aircall-hydra-ui-lib` — how to build & debug `@aircall/ds` / `@aircall/blocks` components; its `debug-blocks` rule starts the server and hands off to this skill.
