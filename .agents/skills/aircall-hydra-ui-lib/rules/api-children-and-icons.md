# api-children-and-icons

Content flows through **`children`**, not through content props. Icons in particular are
passed as children — there is no `icon`/`leftIcon`/`rightIcon` prop on leaf components
(the spec note: *"Icons = children composition, Button-style"*). Icons are always imported
from `@aircall/react-icons`, never `lucide-react` directly.

This is `vercel-composition-patterns`'s `patterns-children-over-render-props`: pass content
as children, don't invent props to inject it.

## Why

- One obvious way to put content in a component.
- `@aircall/react-icons` re-exports all lucide icons + Aircall custom ones, so routing every
  import through it keeps a single swappable source of truth.

## Incorrect

```tsx
import { Phone } from 'lucide-react'          // ✗ never import lucide directly
<Button leftIcon={<Phone />} label="Call" />  // ✗ content via props
```

## Correct (real `button.tsx` / README usage)

```tsx
import { Button } from '@aircall/ds'
import { Phone, Mail } from '@aircall/react-icons'

<Button><Mail />Send Email</Button>          // leading icon = child
<Button variant="outline" size="icon-sm"><Phone /></Button>  // icon-only = icon* size
```

## Exception

A fixed-position structural addon (trailing chevron/lock/action) is a **named prop**, not a
child — see `architecture-named-slot-props`. That's the only carve-out.
