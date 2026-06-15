# ship-changeset

`@aircall/ds` and `@aircall/blocks` are **published, versioned packages** (`"private": false`
— ds `0.10.0`, blocks `0.3.0`). Any change to a component's behavior, API, or styling needs
a **changeset**, or the change ships without a version bump or changelog entry.

> Evidence: both `package.json`s are `"private": false` with semver versions; the repo root
> `.changeset/` already holds ds entries (e.g. `ds-card-spinner-carousel.md`). Versioning is
> driven by `@changesets/cli`.

## Add one (from the Hydra repo root)

```bash
pnpm changeset        # = `changeset add` — interactive: pick package(s) + bump + summary
```

Or use Hydra's `add-changeset` skill, which picks the bump type and writes the file for you.

This writes a markdown file to `<hydra>/.changeset/`; commit it with your change. On release,
`changeset version` bumps the version + writes the CHANGELOG, and `publish:packages` publishes.

## Picking the bump (these packages are pre-1.0 — `0.x`)

Under `0.x` semver, the "breaking" slot shifts down one level:

| Change | Bump |
|---|---|
| New component, new prop/variant (backward-compatible) | **minor** (`0.10.0` → `0.11.0`) |
| Bug fix, style tweak, internal refactor, no API change | **patch** (`0.10.0` → `0.10.1`) |
| Breaking API change (removed/renamed prop, changed default) | treat as **minor** pre-1.0, and call it out loudly in the summary |

Write the summary for a **consumer** reading the changelog: what changed and what they must
do, not the internal mechanics.

## When you can skip it

- Story-only / Storybook-config / test-only changes that don't alter shipped package output.
- Docs, comments, recipes (`src/recipes/` isn't part of the published API).

If in doubt, add a patch changeset — a redundant one is cheap; a missing one means a silent,
unversioned release.
