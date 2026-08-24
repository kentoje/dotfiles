---
name: aircall-hydra-ui-lib
description: Apply established Aircall Hydra design-system and block conventions when changing React UI components. Use when working in `packages/ds` or `packages/blocks`, choosing component composition, wiring variants or polymorphism, or reviewing exports and stories.
---

# Hydra UI library conventions

These conventions describe the established dialect of `@aircall/ds` and `@aircall/blocks`. Inspect a sibling component before deciding; a local precedent beats a novel abstraction. Paths below are relative to the Hydra repository root.

## Stack and package boundary

React 19, Tailwind CSS 4 with OKLCH tokens, Base UI, CVA, `tailwind-merge` through `cn()`, TypeScript, Storybook, and icons from `@aircall/react-icons`. Keep primitives in `@aircall/ds`; compose them in `@aircall/blocks`. Do not reimplement a DS primitive in a block.

## Architecture (critical)

- Multi-part components use compound components split into flat-exported subcomponents. Give each rendered element a `data-slot`; consumers assemble the parts.
- Structureless leaves such as buttons, badges, and spinners stay one component with CVA `variant` and `size` props.
- Fixed-position add-ons are named slot props, not child inspection.
- Prefer composition over boolean mode props. For stateful compounds, put state in a provider and expose a typed context interface containing state, actions, and metadata.

## Styling

- Express variants with `cva()` and `VariantProps`, including `defaultVariants`; export the variants object with the component.
- Merge classes with `cn()` and put `data-slot` on every element. Use `data-*` attributes for state styling.
- Typography is supplied by consumer `text-*` classes, not a typography prop. A CVA `size` controls density or dimensions, never a type scale.

## APIs and types

- Let content, including icons, flow through `children`; import icons from `@aircall/react-icons`.
- Use Base UI's element-based `render` prop for DS polymorphism. Blocks use `useRender` plus `mergeProps`. Never invent an `asChild` convention.
- Follow local interactive-component conventions for `forwardRef` and `displayName`, even under React 19; do not apply generic React 19 advice over an established Hydra pattern.
- Data-driven collections accept opaque `items` plus accessor/render functions (`getItemValue`, `getItemLabel`, `renderItem`). Use string-key sets for behavioral flags and provide a compound escape hatch; do not force a fixed `{ value, label, icon, disabled }` item shape.
- Settle units, null and non-finite handling, locale/formatting, escape-hatch typing, extensibility, and token mapping before implementation.

## Files, workflow, and tests

- Use flat kebab-case component files under `src/components/`; stories use PascalCase under `src/stories/`. Keep the public barrel at top-level `src/index.ts`; no component-directory barrel files.
- For a non-trivial component, investigate sibling components, real call sites, the primitive being composed, and the visual source. Propose two or three APIs with call-site sketches, trade-offs, and a recommendation before coding.
- Stories are the component tests; use `play()` for interactions and opt clean accessibility checks into an error gate when appropriate. Do not add conventional `*.test.tsx` files when the package's story-based convention applies.
- Published DS and blocks behavior, API, or style changes need the repository's changeset process.

## Debugging

Use the repository's Storybook command and the hermetic `agent-browser` skill to inspect the preview surface, console errors, and screenshots. Do not depend on a retired Storybook-specific skill. Re-snapshot after every page change.
