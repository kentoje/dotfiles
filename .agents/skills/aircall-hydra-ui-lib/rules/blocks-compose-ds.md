# blocks-compose-ds

`@aircall/blocks` is the home for **higher-level compositions built on `@aircall/ds`
primitives**. The rules that make a block a block:

- **Compose, never re-implement.** Import `@aircall/ds` components and utilities directly.
  Don't rebuild a button, badge, or input — wrap the DS one.
- **Import `cn` from `@aircall/ds`** (`import { cn } from '@aircall/ds'`), not a local copy —
  so custom token groups dedupe correctly (see `styling-cn-and-data-slot`).
- **Icons from `@aircall/react-icons`.**
- **Match ds's Base UI patterns exactly.** Any interactive or renderable block MUST use
  `useRender` + `mergeProps` (see `api-polymorphism-render`). Pure display containers
  (`<div>`, `<ul>`, separators) don't need `useRender`.
- Same file/export layout as ds — flat files, top-level barrel, no sub-barrels
  (`structure-files-and-exports`).

## Why blocks vs ds vs app

| Where | What lives there |
|---|---|
| `@aircall/ds` | Primitives — the smallest reusable building blocks (Button, Badge, Dialog) |
| `@aircall/blocks` | Reusable compositions of DS primitives (DashboardPage, CopyButton, ProductBadges) |
| the app | One-off compositions specific to that app's screens |

## Correct (real `blocks/product-badges.tsx`, `blocks/copy-button.tsx`)

```tsx
import { Badge, Button, cn } from '@aircall/ds'        // compose DS, shared cn
import { Check, Copy } from '@aircall/react-icons'     // icons via react-icons

// product-badges: wraps DS Badge, restyles via cva([--badge-accent:…]) literal classes
// copy-button: wraps DS Button, compound parts (CopyButton/Icon/Label) share React Context
```

## Incorrect

```tsx
import { cn } from 'clsx'                 // ✗ use cn from @aircall/ds
function MyButton() { return <button className="…" /> }  // ✗ re-implementing a primitive
```

The same composition philosophy from `vercel-composition-patterns` applies — blocks are just
the layer where DS primitives get composed into reusable, shareable pieces.
