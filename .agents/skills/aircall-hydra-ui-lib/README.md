# Hydra UI Library Conventions

Conventions for building components in Aircall's UI libraries — `@aircall/ds`
(design system: Tailwind 4 + Base UI + CVA) and `@aircall/blocks` (higher-level
compositions built on ds) — **as they live in the Aircall Hydra monorepo**. These are the
rules the TypeScript types can't express. Repo paths in `SKILL.md` / the rule files are
relative to the Hydra repo root (`<hydra>`), not to this skill's directory.

Governing principle: **grep a sibling component before deciding** — most "A or B?"
questions already have an established answer next door; divergence needs a written rationale.

## Structure

- `SKILL.md` — entry point: when to apply, quick reference, related skills
- `rules/` — one focused rule file per convention (incorrect/correct examples)

## Rules

### Component Architecture (CRITICAL)

- `architecture-compound-by-default.md` — Multi-part components → flat-exported compound parts
- `architecture-leaf-uses-variants.md` — Structureless leaf → single component + CVA variants
- `architecture-named-slot-props.md` — Fixed-position addon → named prop, not a child

### Styling System (HIGH)

- `styling-cva-variants.md` — Variants via `cva` + `VariantProps`, export the variants object
- `styling-cn-and-data-slot.md` — Merge with shared `cn`; `data-slot` + `data-*` state styling

### Component API (HIGH)

- `api-children-and-icons.md` — Content/icons via `children`; icons from `@aircall/react-icons`
- `api-polymorphism-render.md` — `render` prop (ds) / `useRender` + `mergeProps` (blocks); never `asChild`
- `api-typescript-props.md` — `forwardRef` + `displayName`, extend primitive props, `VariantProps`

### File & Export Layout (MEDIUM)

- `structure-files-and-exports.md` — Flat files, single top-level barrel, no sub-barrels

### Build Workflow (MEDIUM)

- `workflow-spec-first.md` — Spec-first `/build-ds-component` flow; Storybook MCP; a11y gate

### Blocks specifics (MEDIUM)

- `blocks-compose-ds.md` — Compose ds primitives, shared `cn`, mandatory Base UI patterns

### Debugging (MEDIUM)

- `debug-blocks.md` — Run the package's Storybook (`pnpm sb:dev:blocks` / `sb:dev:ds`) and
  drive it with `agent-browser-storybook-dev` to render a single component live

### Testing (HIGH)

- `testing-stories-are-tests.md` — Stories ARE the tests (`@storybook/addon-vitest`, real
  browser); `play()` interaction + a11y gate; `sb:test` in CI; Chromatic for visual regression

### Shipping (MEDIUM)

- `ship-changeset.md` — ds/blocks are published; every behavior/API/style change needs a
  changeset (`pnpm changeset`); pre-1.0 bump rules

## Related skills

- `agent-browser-storybook-dev` — drive agent-browser against a running Storybook; render a
  single story in isolation via the preview iframe. Used by `debug-blocks`.
- `vercel-composition-patterns` — underlying composition philosophy (note: Aircall keeps
  `forwardRef` on React 19, diverging from that skill's `react19-no-forwardref`).
- `vercel-react-best-practices` — apply for performance-sensitive components; its
  `bundle-barrel-imports` is the reasoning behind the no-sub-barrels rule.

## Impact Levels

- `CRITICAL` — Foundational; getting architecture wrong forces a rewrite
- `HIGH` — Significant consistency / correctness impact
- `MEDIUM` — Good practice, keeps the package coherent
