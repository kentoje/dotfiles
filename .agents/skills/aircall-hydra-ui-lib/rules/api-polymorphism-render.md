# api-polymorphism-render

Polymorphism (render this component as a different element/component) goes through the
**Base UI `render` prop** — never `asChild` / Slot (that was the old Radix-based DS).

- In `@aircall/ds`: pass `render={<a href="…" />}` — Base UI merges props/refs into it.
- In `@aircall/blocks`: build the element with `useRender` + `mergeProps` so it accepts a
  `render` prop too. This is **mandatory** for any interactive or renderable block.

> Not to be confused with `vercel-composition-patterns`'s `patterns-children-over-render-props`,
> which warns against *render-callback* props like `renderItem={() => …}`. The Base UI
> `render` prop is element-based polymorphism, a different mechanism — and the preferred one here.

## Why

- `render` lets a `Button` become an `<a>` / router `<Link>` without a `Slot` wrapper.
- `useRender` + `mergeProps` compose event handlers (both `onClick`s fire), classNames, and
  refs. Plain `{...props}` spreading silently drops one of them.

## Incorrect

```tsx
<Button asChild><a href="/profile">Profile</a></Button>   // ✗ asChild is gone

// blocks: plain element + spread loses handler/ref merging
function GroupLabel(props) { return <div {...props} /> }   // ✗ not renderable, drops merges
```

## Correct

```tsx
// ds — render prop
<Button render={<a href="/profile" />}>Go to Profile</Button>
<DialogClose render={<Button variant="outline" />}>Close</DialogClose>

// blocks — useRender + mergeProps (real blocks/AGENTS.md pattern)
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'

function DashboardSidebarGroupLabel({ className, render, ...props }:
  useRender.ComponentProps<'div'> & React.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>({ className: cn('…', className) }, props),
    render,
    state: { slot: 'dashboard-sidebar-group-label' },
  })
}
```

Use `useRender` for interactive/renderable elements (button, action, label). Skip it for
pure display containers (`<div>`, `<ul>`, `<li>`, separators).
