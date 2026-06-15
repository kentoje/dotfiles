# testing-stories-are-tests

**There is no separate unit-test file for a component — the stories ARE the tests.** Both
`@aircall/ds` and `@aircall/blocks` use `@storybook/addon-vitest` (`storybookTest` plugin)
to run every story as a test in a **real browser** (Playwright/Chromium, `pool: 'browsers'`).
That's why there are zero `*.test.tsx` files in either package — it's the policy, not a gap.
Don't add a `*.test.tsx`; add/extend **stories**.

> Confirmed: `packages/{ds,blocks}/vitest.config.ts` (storybookTest + `@vitest/browser-playwright`),
> and a decision doc states it plainly: *"These stories ARE the interaction tests — they run
> via `pnpm --filter @aircall/blocks run sb:test` in Playwright/Chromium."*

## The three layers that run off your stories

1. **Render / smoke** — every story must mount in the browser without throwing. Adding a
   story for a state/variant *is* adding a test for it.
2. **Interaction** — a story's `play()` function is executed and asserted (`@storybook/test`
   `expect` / `userEvent`). This is where behavior is tested (click → state change, open →
   focus, etc.). ds uses these widely (Combobox, DropdownMenu, DataTable, Tabs, …).
3. **Accessibility** — the a11y addon runs as part of the test, wired in
   `.storybook/vitest.setup.ts`:
   ```ts
   import * as a11yAddonAnnotations from '@storybook/addon-a11y/preview';
   setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);
   ```
   An a11y violation fails the run — it is a gate, not a side-quest.

## What "test a component" means here

When you add or change a component, the test work is **story work**:

- A story per meaningful **state and variant** (default, sizes, variants, disabled, error,
  loading) — these become render tests + the Chromatic visual set.
- A `play()` for each **interactive behavior** (what should happen on click/type/open).
- Keep a11y clean (labels on inputs, no nested-interactive, sufficient contrast).

See the Hydra `write-ds-story` skill for the story format/conventions, and
`debug-blocks` / `agent-browser-storybook-dev` for the live feedback loop while writing them.

## Run them

```bash
# from the Hydra repo root — runs the story tests once (not watch)
pnpm --filter @aircall/ds     run sb:test -- --run
pnpm --filter @aircall/blocks run sb:test -- --run
```

`sb:test` = `vitest --project=storybook`. **CI runs this** (`.gitlab/ci/{ds,blocks}/test.gitlab-ci.yml`),
so a failing story = a failing pipeline.

## Visual regression = Chromatic (not your screenshots)

Visual diffs are caught in CI by **Chromatic** (`sb:build:ds:chromatic` /
`sb:build:blocks:chromatic` → `storybook build --test --stats-json`, `@chromatic-com/storybook`).
Your manual agent-browser screenshots are for *development feedback*; Chromatic is the
regression guarantee. More stories (states/variants) = more visual coverage.
