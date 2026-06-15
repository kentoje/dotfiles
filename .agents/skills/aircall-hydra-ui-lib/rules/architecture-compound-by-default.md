# architecture-compound-by-default

**Composition is the default.** Any component with more than one structural part is split
into slotted sub-components, exported flat from one file, each wrapping a Base UI primitive
and setting a `data-slot`. The consumer assembles them — you do not hide the structure
behind boolean props.

This is the same philosophy as `vercel-composition-patterns`
(`architecture-compound-components`, `architecture-avoid-boolean-props`), applied to the
Aircall stack.

## Why

- Consumers control layout and which parts render, without a prop explosion.
- Each part is independently styleable via its `data-slot`.
- Matches the Figma structure (the `build-ds-component` spec requires a "Composition rules"
  section for exactly this reason).

## Incorrect — one component, boolean/slot props

```tsx
// Hides structure, grows a new prop per need, can't be re-ordered.
<Dialog
  title="Delete?"
  description="This cannot be undone."
  showHeader
  showFooter
  footerButtons={[/* … */]}
/>
```

## Correct — flat-exported compound parts (real shape of `dialog.tsx`)

```tsx
export { Dialog, DialogTrigger, DialogContent, DialogHeader,
         DialogFooter, DialogTitle, DialogDescription, DialogClose }

// Consumer assembles:
<Dialog>
  <DialogTrigger render={<Button>Open</Button>} />
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete?</DialogTitle>
      <DialogDescription>This cannot be undone.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <DialogClose render={<Button variant="outline">Cancel</Button>} />
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Each sub-component is a small function that sets `data-slot` and merges `className`:

```tsx
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-2', className)} {...props} />
}
```

For coordinated state across parts, use React Context (see `blocks/copy-button.tsx`:
`CopyButton` provides `copied`, `CopyButtonIcon`/`CopyButtonLabel` consume it).

## Decision

> Multiple structural parts, or any "trigger + content" relationship → compound components.
> A structureless leaf → see `architecture-leaf-uses-variants`.
