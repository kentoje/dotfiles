# api-no-typographic-props

Typography (font-size, weight, line-height) is a **consumer `className` concern** (`text-*`,
`font-*`), **not a component prop**. Do not add a per-component `size`/typographic-scale prop
that sets the type scale.

## Why

- There is **no DS-wide typographic-scale system** yet. A per-component `size` that maps to
  `text-sm` / `text-xl` / `text-3xl` is a *local* invention — the moment two components pick
  different scales or names, the DS drifts. Until there's a system-wide decision (owned with
  design), typography stays a plain className the consumer sets.
- Inline/text-like components should **inherit the surrounding typography**, not impose one.
  A prop fights that.
- This is what the rest of the DS already does — grep: components don't expose a text-scale
  prop; consumers write `className="text-xl font-bold"`.

## Dimensional `size` is different — and still fine

`architecture-leaf-uses-variants` legitimately uses a CVA `size` for **control dimensions /
density** (Button `sm`/`lg` = padding, height, icon box). That is *not* a type scale. The
line: a `size` that changes **box metrics** is fine; a `size` that changes **font-size /
weight / line-height** is not — that's `className`.

## Incorrect — typographic size prop

```tsx
// re-invents a type scale locally; no cross-component alignment
size?: 'body-sm' | 'body' | 'title-xs' | 'title-sm' | 'title'
<InlineEditInput size="title-sm" />
```

## Correct — typography via className, component inherits

```tsx
<InlineEditInput className="text-xl font-bold" />   // consumer owns the scale
```

If icon/line-box alignment inside the component depends on the type size, derive it from the
**inherited** line-height (e.g. `min-h-[1lh]` on an icon slot), not from a `size` prop.

## Decision

> No typographic-scale prop. Typography = consumer `className` (`text-*`/`font-*`); the
> component inherits it. A CVA `size` is allowed only for control dimensions/density, never
> for type scale — until a system-wide typography-variant decision exists.
