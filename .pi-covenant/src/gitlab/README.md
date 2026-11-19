# GitLab in Pi

Configure the GitLab host and the absolute path to its glab YAML credential file, then load the standard Pi extension from the checkout you want to inspect.

```sh
export PI_COVENANT_GITLAB_HOST=gitlab.example.com
export PI_COVENANT_GITLAB_CREDENTIAL_FILE="$HOME/.config/glab-cli/config.yml"
pi -e /Users/kento/dotfiles/.pi-covenant/src/foundation/extension.ts
```

The selected host's exact `hosts[host]` entry must provide a file-backed PAT or OAuth access token. Keyring-authoritative stores, refresh, and job tokens require a separate trusted host credential integration. The file bridge has no fallback to project settings or another host. The API uses HTTPS by default. `PI_COVENANT_GITLAB_API_ORIGIN` can override the origin through trusted host configuration. Explicit loopback HTTP supports test fixtures.

- `repository` returns identity and the observed default branch.
- `pipelines` lists one page with optional `ref`, `sha` and `state`. Reuse the same filters and page size with the returned cursor.
- `pipeline` reads the exact `pipeline_id`.
- `jobs` lists one page for `pipeline_id`. Set `include_retried` to include prior attempts.
- `job` reads the exact `job_id`.
- `logs` reads a bounded job trace window, with original byte offset and continuation. Configured credentials are masked across window boundaries.
- `retry` and `cancel` require `repository` and `pipeline_id`. Interactive Pi asks for confirmation of the exact action and target. Headless Pi lacks that authority. A programmatic host can inject an existing authority decision. Accepted requests report the observed state. Uncertain delivery returns `indeterminate` and is never automatically replayed.

Read targets can come from a single distinct eligible checkout remote, or an explicit selector such as `https://gitlab.example.com/team/app`. Ambiguous remotes and conflicting explicit cwd/repository selectors block. The resolver interprets simple local Git remotes. Git config includes, URL rewrites, per-worktree config, non-ASCII paths and custom API subpaths are outside the supported slice.

Private `lookup_open_mrs` searches opened MRs on the selected project's endpoint and filters by exact source project and branch. Complete lookup applies to that endpoint and query. It does not establish absence across all fork targets. Pipeline and job lists describe the requested page and scope. Child-pipeline traversal and CI readiness policy belong to callers.

Use `pnpm check` for Covenant verification. The Pi SDK smoke runs against loopback HTTP with a temporary credential file. Live server compatibility and interactive TUI confirmation are not covered by that smoke. See [ADR-012](../../docs/decisions/ADR-012-gitlab-ci-and-pi.md).
