# styling-cva-variants

Express every visual variant with **Class Variance Authority** (`cva`) and type the props
with `VariantProps`. Always supply `defaultVariants`. Export the variants object next to
the component so consumers/recipes can reuse it.

## Why

- Type-safe, literal-union variant props inferred straight from the class map.
- Mutually-exclusive states can't contradict (one `variant`, one `size`).
- Composable: `buttonVariants({ variant, size, className })` returns the merged class string.

## Pattern (real shape of `button.tsx`)

```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@aircall/ds/lib/utils'

const buttonVariants = cva('…base…', {
  variants: {
    variant: { default: '…', outline: '…', /* … */ },
    size:    { default: '…', sm: '…', /* … */ },
  },
  defaultVariants: { variant: 'default', size: 'default' },
})

export interface ButtonProps
  extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  children?: React.ReactNode
}

// …in render:
className={cn(buttonVariants({ variant, size, block, className }))}

export { Button, buttonVariants }   // export the variants too
```

## Notes

- Put `className` *inside* the `cva` call (`buttonVariants({ …, className })`) so it
  participates in `tailwind-merge` conflict resolution, then wrap in `cn` — see
  `styling-cn-and-data-slot`.
- For data-driven colors prefer a literal `[--token:var(--color-x)]` class over inline
  `style` (real pattern in `blocks/product-badges.tsx`), so the Tailwind scanner emits CSS.

See also `vercel-composition-patterns` `patterns-explicit-variants`.
