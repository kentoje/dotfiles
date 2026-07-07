---
name: aircall-hydra-ui-lib
description:
  Conventions for building components in Aircall's UI libraries — @aircall/ds
  (design system, Tailwind 4 + Base UI) and @aircall/blocks (higher-level
  compositions) — as they live in the Aircall Hydra monorepo. Use when adding or
  refactoring a component in packages/ds or packages/blocks, deciding between a
  compound component and a prop, wiring variants, polymorphism, or exports.
  Triggers on "build a DS component", "add a block", or work touching
  packages/ds / packages/blocks inside Hydra.
license: MIT
metadata:
  author: kento
  version: "1.1.0"
---

# Hydra UI Library Conventions

How to build components the way `@aircall/ds` and `@aircall/blocks` already do it.
These are the rules the TypeScript types can't express. **This skill targets the Aircall
Hydra monorepo** — all repo paths below are relative to the Hydra repo root (e.g.
`~/.../gitlab/hydra/`), not to this skill's directory. The governing principle across both
packages: **grep a sibling component before deciding** — almost every "should this be A or
B?" already has an established answer next door, and any divergence needs an explicit
written rationale.

Authoritative sources (paths relative to the Hydra monorepo root):

- `<hydra>/packages/ds/AGENTS.md` — DS rules (flat files, Base UI, no barrel files)
- `<hydra>/packages/blocks/AGENTS.md` — blocks rules (compose ds, `useRender` mandatory).
  ⚠️ Stale on layout: it says per-component dirs + `__tests__/`, but the real convention is
  flat kebab-case files + stories-as-tests — trust `structure-files-and-exports` /
  `testing-stories-are-tests` below over AGENTS.md.
- `<hydra>/.agents/skills/build-ds-component/SKILL.md` — the spec-first build workflow
- `<hydra>/.agents/skills/write-ds-story/SKILL.md` — Storybook conventions

## When to Apply

- Adding a new component to `@aircall/ds` or a new block to `@aircall/blocks`
- Refactoring an existing component's API
- Deciding between a compound component, a variant prop, or a named slot prop
- Reviewing a UI PR in `packages/ds` / `packages/blocks`
- Wiring styling (CVA + `cn`), polymorphism (`render` / `useRender`), or exports

## Tech stack (both packages)

React 19 · TailwindCSS 4 (OKLch tokens) · Base UI (`@base-ui/react`) ·
Class Variance Authority (CVA) · `tailwind-merge` via `cn()` · TypeScript 5.7 ·
Storybook 10. Icons always from `@aircall/react-icons`, never `lucide-react`.

## Rule Categories by Priority

| Priority | Category               | Impact   | Prefix          |
| -------- | ---------------------- | -------- | --------------- |
| 1        | Component Architecture | CRITICAL | `architecture-` |
| 2        | Styling System         | HIGH     | `styling-`      |
| 3        | Component API          | HIGH     | `api-`          |
| 4        | File & Export Layout   | MEDIUM   | `structure-`    |
| 5        | Build Workflow         | MEDIUM   | `workflow-`     |
| 6        | Blocks specifics       | MEDIUM   | `blocks-`       |
| 7        | Debugging              | MEDIUM   | `debug-`        |
| 8        | Testing                | HIGH     | `testing-`      |
| 9        | Shipping               | MEDIUM   | `ship-`         |

## Quick Reference

### 1. Component Architecture (CRITICAL)

- `architecture-compound-by-default` — Multi-part components split into flat-exported
  sub-components, each a `data-slot`; the consumer assembles them (`Dialog`, `Card`).
- `architecture-leaf-uses-variants` — A structureless leaf (button, badge, spinner) stays
  a single component with CVA `variant`/`size` props; do **not** decompose it.
- `architecture-named-slot-props` — A fixed-position addon (trailing icon, action) is an
  explicit named prop, not a child. Avoids `React.Children` inspection.

### 2. Styling System (HIGH)

- `styling-cva-variants` — Express variants with `cva()` + `VariantProps`, with
  `defaultVariants`. Export the variants object alongside the component.
- `styling-cn-and-data-slot` — Merge classes with `cn()` from `@aircall/ds`; set a
  `data-slot` on every element; drive state styling with `data-*` attributes.

### 3. Component API (HIGH)

- `api-children-and-icons` — Content (incl. icons) flows through `children`, not props.
  Icons imported from `@aircall/react-icons`.
- `api-polymorphism-render` — Polymorphism via the Base UI `render` prop (ds) or
  `useRender` + `mergeProps` (blocks). Never `asChild`.
- `api-typescript-props` — `forwardRef` + `displayName` for interactive components;
  props extend the Base UI primitive's props; variants typed via `VariantProps`.
- `api-design-checklist` — Settle the API before writing code: the recurring forks to
  resolve up front (input domain/units, null & non-finite handling, locale/formatting,
  escape-hatch typing, extensibility hook, token mapping) so they don't surface mid-build.

### 4. File & Export Layout (MEDIUM)

- `structure-files-and-exports` — Flat kebab-case files in `src/components/`, stories in
  `src/stories/` (PascalCase). Public API is the top-level `src/index.ts` barrel only.
  **No barrel files inside component subdirectories.**

### 5. Build Workflow (MEDIUM)

- `workflow-spec-first` — Non-trivial new component (ds **or** blocks): investigate first
  (Figma + real call-sites + sibling components + the primitive you compose), **propose 2-3
  candidate APIs with call-site sketches + a trade-off table + a recommendation, and converge
  before writing code**, then implement + self-verify. Full `specs/<name>.spec.md` via
  `/build-ds-component` for ds primitives; a short in-conversation API proposal for blocks.

### 6. Blocks specifics (MEDIUM)

- `blocks-compose-ds` — Import `@aircall/ds` components and `cn` directly; never
  re-implement a primitive. Interactive/renderable blocks must use `useRender` +
  `mergeProps`, matching ds's Base UI patterns.

### 7. Debugging (MEDIUM)

- `debug-blocks` — See a block/component render live: start its Storybook from the Hydra
  root (`pnpm sb:dev:blocks` → :6009, `pnpm sb:dev:ds` → :6008), then drive it with the
  `agent-browser-storybook-dev` skill — open the **preview iframe** to render only the
  component (no sidebar/toolbar), read `console`/`errors`, screenshot, iterate via HMR.

### 8. Testing (HIGH)

- `testing-stories-are-tests` — There are **no `*.test.tsx` files** — stories ARE the tests.
  `@storybook/addon-vitest` runs every story in a real browser; `play()` = interaction tests.
  a11y runs on every story but is **report-only by default** (`test: 'todo'`) — opt a clean
  component in with `a11y: { test: 'error' }` on its meta to actually gate. Run
  `pnpm --filter @aircall/ds run sb:test -- --run` (CI runs it). Visual regression is Chromatic.

### 9. Shipping (MEDIUM)

- `ship-changeset` — ds/blocks are **published packages**; any behavior/API/style change
  needs a changeset (`pnpm changeset` from the Hydra root, or the `add-changeset` skill).
  Pre-1.0 `0.x`: minor for new component/prop, patch for fixes.

## How to Use

Read individual rule files for explanations and incorrect/correct examples:

```
rules/architecture-compound-by-default.md
rules/styling-cva-variants.md
```

## Related skills

These Aircall conventions are a concrete dialect of two general skills — consult them
for the deeper "why", and read the divergence notes below before applying them verbatim.

- **`vercel-composition-patterns`** — the underlying composition philosophy. Aircall's
  `architecture-compound-by-default`, `architecture-leaf-uses-variants` (≈
  `patterns-explicit-variants`), and `api-children-and-icons` (≈
  `patterns-children-over-render-props`) are direct applications.
  ⚠️ **Two divergences:**
  1. That skill's `react19-no-forwardref` says drop `forwardRef` on React 19.
     `@aircall/ds` is on React 19 but **still uses `forwardRef` + `displayName`** as its
     established convention (see `button.tsx`). Follow the codebase, not the rule.
  2. Its `patterns-children-over-render-props` warns against _render-callback_ props
     (`renderItem={() => …}`). The Base UI **`render` prop** Aircall uses is
     element-based polymorphism (`render={<a />}`), a different thing — not in conflict.

- **`vercel-react-best-practices`** — apply when the component has a performance surface
  (lists, expensive renders, heavy deps). Note its `bundle-barrel-imports` rule is the
  same reasoning behind Aircall's "no barrel files in subdirectories" rule
  (`structure-files-and-exports`).
