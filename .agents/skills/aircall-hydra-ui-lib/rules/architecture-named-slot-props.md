# architecture-named-slot-props

The one place a slot is a **prop instead of a child**: a fixed-position addon (a trailing
icon, a chevron, a lock, an `action`). When the slot is positional/structural rather than
free content, expose it as an explicit named prop. This avoids inspecting `React.Children`
to figure out which child goes where, and guarantees correct layout.

This is the documented exception to `api-children-and-icons` — content is children, but a
*structural addon* is a named prop.

## Why

- `children` stays a single flowing region (label + inline badges).
- The addon renders in a guaranteed position (right-aligned), no child-order fragility.
- Mirrors the DS `InputGroup` right-addon pattern.

## Incorrect — addon smuggled into children

```tsx
// Won't right-align reliably; forces React.Children inspection internally.
<DashboardSidebarMenuButton icon={<Bot />}>
  AI Agents
  <ChevronRight />   {/* ← wrong: an addon masquerading as content */}
</DashboardSidebarMenuButton>
```

## Correct — explicit `action` prop (real `blocks/AGENTS.md` rule)

```tsx
// children = label (+ inline badges, flex-1). action = the trailing addon.
<DashboardSidebarMenuButton icon={<Bot />} action={<ChevronRight />}>
  AI Agents
</DashboardSidebarMenuButton>

<DashboardSidebarMenuButton icon={<Sparkles />} action={<ChevronRight />}>
  AI Assist
  <Badge color="charcoal" tone="medium-light">Trial</Badge>  {/* inline badge IS content */}
</DashboardSidebarMenuButton>
```

(`DashboardSidebarMenuAction` was retired in favor of this `action` prop.)

## Decision

> Free content → `children`. A fixed-position structural addon → a named prop
> (`icon`, `action`, …). When unsure, grep the sibling for the established name.
