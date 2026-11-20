# Read-only Fleet in Pi

Set `PI_COVENANT_FLEET_FILE` to an absolute trusted JSON inventory before loading the extension:

```json
{
  "repositories": [
    {
      "id": "app",
      "path": "/absolute/path/to/app",
      "comparisonRef": "refs/remotes/origin/main"
    },
    {
      "id": "ui",
      "path": "/absolute/path/to/ui",
      "manifests": ["package.json", "packages/components/package.json"]
    }
  ]
}
```

`status` reads the selected checkouts' branch, HEAD and tracked and untracked changes. It compares against the configured local ref or the local upstream ref. Counts are unknown if that ref or history is unavailable. Configured GitLab access adds a one-shot open MR observation. A failed remote lookup retains the local row and reports a partial result.

`versions` takes a package name and returns exact declarations with their manifest and dependency section. An explicit manifest list selects exactly those paths. Otherwise Fleet reads the root Node manifest and declared npm, Yarn or pnpm workspaces. It reports workspace or catalog syntax as written. Unsupported, missing or malformed inputs remain per-repository errors.

Both actions accept optional `repositories` IDs. Omit the field for inventory order, or pass IDs in the desired order. Duplicate IDs are collapsed. An unknown ID blocks the request before inspection.

[Behavior contract](../../contracts/fleet/intent.md) · [Tool schema](../../tools/fleet/definition.json)
