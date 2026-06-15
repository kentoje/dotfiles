# styling-cn-and-data-slot

Two non-negotiables for styling:

1. **Merge classes with `cn()`** — and use the shared one. `cn` is `tailwind-merge`
   (extended with DS + blocks custom color tokens) wrapping `clsx`. Blocks import the *same*
   `cn` from `@aircall/ds`; they must not define their own (otherwise custom tokens like
   `text-secondary` won't dedupe correctly).
2. **Set a `data-slot` on every rendered element**, and drive state-based styling with
   `data-*` attributes rather than conditional class strings.

## Why

- `cn` resolves Tailwind conflicts (`px-2` vs `px-4`) and respects custom token groups.
- `data-slot` gives every part a stable styling/testing hook and lets parents target
  descendants (`has-data-[slot=card-footer]:pb-0`, `group-data-[size=sm]/card:px-3`).
- `data-*` state (`data-[size=sm]`, `data-open`, `aria-expanded`) keeps styling declarative.

## Incorrect

```tsx
import { cn } from './my-local-cn'                 // ✗ not the shared cn
<div className={`card ${size === 'sm' ? 'gap-3' : 'gap-4'}`} />  // ✗ no data-slot, imperative
```

## Correct (real shape of `card.tsx`)

```tsx
import { cn } from '@aircall/ds/lib/utils'   // or `import { cn } from '@aircall/ds'` in blocks

function Card({ className, size = 'default', ...props }:
  React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn('flex flex-col gap-4 … data-[size=sm]:gap-3 data-[size=sm]:py-3', className)}
      {...props}
    />
  )
}
```

`className` is always accepted and merged **last** so consumers can override.
