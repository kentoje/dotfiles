# architecture-leaf-uses-variants

A component with **no internal structure** (button, badge, spinner, label) stays a single
component whose looks are driven by CVA `variant` / `size` props. Do **not** decompose a
leaf into `<Button><ButtonLabel/></Button>` — that's composition for its own sake.

This is `vercel-composition-patterns`'s `patterns-explicit-variants`: variants are explicit,
typed string unions, not booleans.

## Why

- One leaf, one component, is the smallest API that does the job.
- CVA gives type-safe, mutually-exclusive variants for free.
- Avoids the boolean-prop trap (`primary` + `large` + `danger` booleans that can contradict).

## Incorrect — boolean modes

```tsx
<Button primary large />        // what does primary + secondary mean? unclear
<Button danger outline block /> // contradictory combinations are representable
```

## Correct — CVA variants (real shape of `button.tsx`)

```tsx
const buttonVariants = cva('…base classes…', {
  variants: {
    variant: { default: '…', outline: '…', secondary: '…', ghost: '…', destructive: '…', link: '…' },
    size:    { default: '…', sm: '…', lg: '…', icon: '…', 'icon-sm': '…', 'icon-lg': '…' },
    block:   { true: 'w-full' },
  },
  defaultVariants: { variant: 'default', size: 'default', block: false },
})

<Button variant="destructive" size="sm">Delete</Button>
```

A `size` variant here means **control dimensions / density** (padding, height, icon box) —
not a type scale. Never add a `size` that sets font-size/weight/line-height; typography is a
consumer `className`. See `api-no-typographic-props`.

See `styling-cva-variants` for how to wire CVA + `VariantProps`, and
`api-children-and-icons` for why the icon is a child, not a prop.

## Decision

> No sub-parts → single component + CVA variants. Content via `children`.
