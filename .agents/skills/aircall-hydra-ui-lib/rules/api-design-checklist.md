# api-design-checklist

The forks to **settle at API-design time** for a non-trivial component — before writing
component code (see `workflow-spec-first` for the propose-2-3-options-and-converge loop).
Each of these is cheap to decide up front and expensive to discover mid-build or in review.
Resolve them in the proposal, not the implementation.

## 1. Shape & where state lives

Pick the shape first (see the `architecture-*` rules):

- **Leaf + variants** — no sub-parts → one component + CVA `variant`/`size` (`architecture-leaf-uses-variants`).
- **Compound** — multiple arrangeable parts → flat-exported sub-components (`architecture-compound-by-default`).
- **Provider + leaf** — a root that shares state with children it renders.

For anything with shared state, decide **which element owns the value** — and remember data
flows **top-down**: the element that decides the styling must hold the value. If the *pill*
is colored from a number, the number lives on the *pill*, and children read it (via context /
a hook), not the reverse. Don't design a shape that needs a child to push state back up to
color its parent.

## 2. Input domain & units

State them in the API, don't leave them implicit:

- Range/units: `0–100` vs `0–1` (an `Intl` percent formatter wants `0–1`; a 0–100 score must
  be scaled). Currency? Fractions?
- Nullable: is "no value" a real state? Model it (`value?: number | null`).

## 3. Degenerate / edge values

Decide the behavior for each, in the proposal:

- `null` / `undefined` / **non-finite** (`NaN`, `±Infinity`) → a graceful placeholder
  (muted `"--"`), never `"NaN%"`.
- Out-of-range **finite** values → render **honestly** by default (`150 → "150%"`); don't
  silently clamp real data unless the domain truly demands it (and clamping rarely makes
  sense for open-ended scales).
- **No `console.error` / `console.warn` in the render path** — it fires every render and
  spams consumer/test consoles; a data value out of range is not a contract violation.

## 4. Formatting & i18n

- Locale-aware numbers/dates via `Intl.*` keyed to the DS language: `useDsLocale()` (it's
  `@internal` but **exported from `@aircall/ds` for blocks**, alongside `useDsTranslation`).
- Merge caller overrides over per-kind defaults (`formatOptions?: Intl.NumberFormatOptions`)
  rather than hard-coding.
- Keep story/test output **deterministic** — assert against the default DS locale (`en`), or
  match with a locale-agnostic regex for the localized story.

## 5. Escape-hatch typing — real union, not `(string & {})`

When a prop should accept "one of ours, or any valid token", type it with a **real exported
union**, not `(string & {})` (which gives autocomplete but zero validation):

```ts
// the barrel may not re-export the primitive's type — derive it from the primitive's props:
type BadgeColor = NonNullable<React.ComponentProps<typeof Badge>['color']>;
export type ScoreTone = ScoreTonePreset | BadgeColor;  // validated, autocompleted, on-system
```

## 6. Extensibility — a guarded hook, not the raw Context

To let consumers build custom sub-parts, export a **guarded hook**, not the `React.Context`
object (a context is a leaky, fragile contract). Mirror blocks' `useFieldContext` shape:

```ts
export function useScoreValue(): ScoreContextValue {
  const ctx = React.useContext(ScoreContext);
  if (!ctx) throw new Error('`useScoreValue` must be used inside a `ScoreBadge`.');
  return ctx;
}
```

The hook can also hand consumers otherwise-internal context (e.g. the DS locale) they'd need
to format custom content on-system.

## 7. Token mapping — map onto the primitive, don't reinvent

When color/spacing/typography comes from Figma, map the design intent onto the **composed
primitive's existing tokens** rather than inventing new classes. Read the resolved values:
e.g. Figma's white-film opacities `0.6 / 0.8` are exactly the DS `Badge` `medium-light` /
`light` tone films — so a `tone → { color, tone }` table reuses `Badge` and inherits
dark-mode + contrast for free. No freeform hex.

## Decision

> Before coding a non-trivial component, write down: shape + state owner, input domain,
> edge-value behavior, formatting/i18n, escape-hatch typing, extensibility hook, token
> mapping. If any is unresolved, the API isn't ready — go back to `workflow-spec-first`.
