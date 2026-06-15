# structure-files-and-exports

File layout and public API — identical in both packages despite what stale docs may say.

- **Components are flat kebab-case files** in `src/components/<name>.tsx`
  (`button.tsx`, `alert-dialog.tsx`, `product-badges.tsx`, `copy-button.tsx`).
- **Stories live separately** in `src/stories/<Name>.stories.tsx` (PascalCase).
- **Shared hooks** in `src/hooks/`.
- **The public API is the top-level `src/index.ts` barrel only.** Add your exports there
  (ds keeps `index.ts` alphabetical).
- **No barrel `index.ts` files inside component subdirectories.** This is a hard rule in
  both `AGENTS.md` files and the repo root `AGENTS.md`.

> This no-subdirectory-barrel rule is the same reasoning as `vercel-react-best-practices`'s
> `bundle-barrel-imports`: barrels defeat tree-shaking and pull in unrelated modules. The
> single top-level barrel is the intentional, tree-shakeable public surface (ds preserves
> its module graph via `tsdown` `unbundle` + `sideEffects: ["**/*.css"]`).

## ⚠️ Docs that lie — trust the code

- `packages/ds/AGENTS.md` *Rules* says "one directory per component" — **wrong**; the
  Component-Structure section and actual code are flat files. Use flat files.
- `packages/blocks/AGENTS.md` *Component Structure* describes `src/components/<Name>/<Name>.tsx`
  + co-located `__tests__/` — **stale**; real blocks are flat files in `src/components/`
  with stories in `src/stories/`. Match the existing files, not the prose.

When the doc and the neighboring files disagree, **the files win** — grep a sibling.

## Adding a component (ds)

1. `src/components/<name>.tsx` (kebab-case, flat)
2. Build with Tailwind 4 + Base UI primitives
3. Export from `src/index.ts` (alphabetical)
4. `src/stories/<Name>.stories.tsx`
5. `pnpm --filter @aircall/ds run lint`

(Recipes in `src/recipes/` are a separate concept — copy-paste shadcn-registry patterns,
relative imports, **not** exported from `src/index.ts`.)
