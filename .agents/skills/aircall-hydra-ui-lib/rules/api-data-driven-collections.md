# api-data-driven-collections

A component that renders a **list of options from data** (select, combobox, menu, tag
picker) takes opaque `items: T[]` plus **accessor functions**, not a fixed item shape.
This is the `DataCombobox` API (`packages/ds/src/components/data-combobox.tsx`) — mirror it
for consistency, and grep it before designing a new one.

```ts
items: T[]
getItemValue: (item: T) => string          // the submitted key
getItemLabel: (item: T) => string          // plain-text label (trigger, typeahead)
renderItem?: (item: T) => React.ReactNode   // optional rich row (icon, subtitle, …)
```

## Why

- A fixed shape like `{ value, label, icon, disabled }` **doesn't scale**: the day a consumer
  needs a subtitle, a count, or a color, the item type *and* the internal implementation both
  have to change. Accessors keep the item type the consumer's own.
- The trigger shows **`getItemLabel` (plain text)**; **`renderItem` drives the dropdown rows
  only** (that's where per-option icons live). Don't wire `renderItem` into the trigger.
- Values are **string keys** (`getItemValue` returns `string`), so selection state, disabled
  sets, and controlled `value` are all plain strings — no generic value gymnastics.

## Behavioral flags are separate props, not item fields

`disabled` (and `selected`, etc.) are **behavioral**, not display, concerns. Keep them out of
the item shape and express them as key sets, applied on the underlying primitive:

```ts
disabledKeys?: Set<string>   // → disabled={disabledKeys?.has(getItemValue(item))}
```

## Always keep a compound escape hatch

Pair the data-driven mode with compound sub-parts (`architecture-compound-by-default`) for
custom rows the accessors can't express. Discriminate the two on the data prop (`items` vs
`children`), and give each mode its own component so the dispatcher holds no hooks.

## Incorrect — fixed item shape + baked-in behavior

```tsx
type Option<T> = { value: T; label: React.ReactNode; icon?: React.ReactNode; disabled?: boolean };
<InlineEditSelect options={[{ value: 'a', label: 'A', icon: <X/>, disabled: true }]} />
// consumer needs a subtitle → must edit Option<T> and the component
```

## Correct — accessors + disabledKeys (real shape of `inline-edit-select.tsx`)

```tsx
<InlineEditSelect
  items={callOutcomes}
  getItemValue={o => o.id}
  getItemLabel={o => o.name}
  renderItem={o => <span className="flex items-center gap-2">{o.icon}{o.name}</span>}
  disabledKeys={new Set(['archived'])}
/>
```

## Note vs `vercel-composition-patterns`

That skill's `patterns-children-over-render-props` warns against render-callback props. The
`renderItem` accessor is the **sanctioned exception** for data-driven collections: the item
value only exists at map-time, so a callback is the right tool (this is what `DataCombobox`
does). It is *not* the Base UI element `render` prop — see the divergence note in `SKILL.md`.

## Decision

> Rendering options from data → `items` + `getItemValue`/`getItemLabel`/`renderItem` (mirror
> `DataCombobox`), string-key values, behavioral flags as `*Keys: Set<string>` props, plus a
> compound escape hatch. Never a fixed `{ value, label, icon, disabled }` item type.
