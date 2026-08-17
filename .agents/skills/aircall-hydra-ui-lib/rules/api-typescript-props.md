# api-typescript-props

Typing conventions for component props.

- **Extend the Base UI primitive's props**, then intersect `VariantProps<typeof xVariants>`
  for the CVA-driven props. Don't hand-roll a prop list the primitive already provides.
- **`forwardRef` + explicit `displayName`** for interactive components. Plain function
  components are fine for pure display containers (`Card`, `DialogHeader`).
- Sub-components type as `React.ComponentProps<'div'>` (or the primitive's `*.Props`).
- ds uses a `namespace` to co-locate the props type (`Button.Props`).

> ⚠️ **Divergence from `vercel-composition-patterns` `react19-no-forwardref`.** That rule says
> drop `forwardRef` on React 19. `@aircall/ds` is on React 19 but **keeps `forwardRef` +
> `displayName`** as its established convention. Follow the codebase here — match
> `button.tsx`, don't "modernize" it.

## Correct (real `button.tsx`)

```tsx
const Button = React.forwardRef<HTMLButtonElement, Button.Props>(
  (componentProps, forwardRef) => {
    const { className, variant = 'default', size = 'default', block = false, ...props } = componentProps
    return (
      <ButtonPrimitive
        ref={forwardRef}
        data-slot="button"
        data-variant={variant}
        className={cn(buttonVariants({ variant, size, block, className }))}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  children?: React.ReactNode
}
export namespace Button { export type Props = ButtonProps }
```

## Notes

- Restrict a wrapped prop when only a subset is valid (real `blocks/copy-button.tsx`):
  `Omit<…Button props…, 'variant'> & { variant?: 'outline' | 'ghost' }`.
- **Name collisions need an explicit `Omit`.** When `interface XProps extends` a primitive/DOM
  props type and you redeclare a member that the base already has with an incompatible type — e.g.
  a custom `onCopy?: (value: string) => void` vs the DOM `onCopy?: ClipboardEventHandler` — TS errors
  with **TS2430** (`interface extends` rejects the collision that the legacy `type &` form silently
  intersected). `Omit` the clashing member from the base: `extends Omit<…Props…, 'onCopy'>`.
- Don't invent props — the shipped `.d.ts` (literal-union variants) is the source of truth.
  When in doubt about an existing component, query the Storybook MCP, don't guess.
