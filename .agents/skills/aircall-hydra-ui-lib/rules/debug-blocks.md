# debug-blocks

How to see a `@aircall/blocks` (or `@aircall/ds`) component rendering live and debug it.
Storybook is the harness — there is no separate app to run for a block.

> Paths/commands are run from the **Hydra monorepo root** (`<hydra>`).

## 1. Start the package's Storybook dev server

From the Hydra repo root:

```bash
pnpm sb:dev:blocks      # @aircall/blocks → http://localhost:6009
pnpm sb:dev:ds          # @aircall/ds     → http://localhost:6008
```

It's long-lived — start it once (in the background / its own pane) and leave it running.
Wait for the "Storybook started" line before driving a browser at it.

> `sb:dev:blocks` = `turbo run sb:dev --continue --filter=@aircall/blocks`; the underlying
> package script is `storybook dev -p 6009`. ds is port 6008.

## 2. Drive it with agent-browser — render the component in isolation

Use the **`agent-browser-storybook-dev`** skill. The one thing to remember: open the
**preview iframe**, not the manager, so the sidebar / toolbar / addons chrome is gone and
you see only the component:

```
http://localhost:6009/iframe.html?id=<storyId>&viewMode=story
```

Story id = `kebab-case(meta.title)` + `--` + `kebab-case(export)` (e.g.
`utilities-copybutton--icon-only`); list them from `http://localhost:6009/index.json`. Force
dark mode with `&globals=theme:dark`. Then snapshot, interact, screenshot the component
(`screenshot "#storybook-root" out.png` — selector is positional), and read
`agent-browser … console` / `errors` to debug. Full command flow lives in that skill.

## 3. Debug loop

1. Reload the story → `agent-browser --session storybook console --clear`
2. Reproduce the interaction (click/fill via `@refs`)
3. Read `console` + `errors`; inspect with `get styles` / `eval`
4. Fix in `<hydra>/packages/blocks/src/components/<name>.tsx`
5. Storybook HMR re-renders — re-snapshot and verify

## Notes

- A block has no standalone runtime; if it misbehaves *inside aw-web*, also reproduce it in
  the app — but Storybook is the fast first loop.
- For a11y issues, the Storybook a11y addon / `run-story-tests` is the gate (see
  `workflow-spec-first`).
- Use the package's Storybook MCP (`blocks-storybook-mcp` :6009 / `ds-storybook-mcp` :6008)
  to confirm a component's real props before using them.
