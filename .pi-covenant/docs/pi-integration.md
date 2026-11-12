# Running the custom harness in Pi

The harness is an additive standard Pi extension. It currently registers `project_cli` and `worktree`. GitLab, Jira, MR, fleet, /ship and /harness-retro are not registered yet. No runtime Covenant/TLA+, completion gate, retry policy, prompt replacement or automatic follow-up turn is installed.

## Load the extension

Install this checkout's dependencies with `pnpm install --frozen-lockfile`. From the project you want to work in:

```sh
pi -e /Users/kento/dotfiles/.pi-covenant/src/foundation/extension.ts
```

The package also declares its extension in package.json for Pi package loading. Loading explicitly avoids changing global Pi configuration. Development and acceptance use standard Pi 1.5.0 with Node 24; other Pi variants/versions have not been verified.

`project_cli` accepts `action: inspect | check`, optional `project` and `config`, and `keep_going` for check only. Project paths resolve from the current Pi session cwd, including relative explicit overrides. Inspection reports the selected/covered/available inventory; check reports every selected outcome and failure diagnostics. A failed check is an error result, even if later checks pass. E2E and builds remain project-specific.

## Configure worktrees explicitly

Worktree locations and executable setup come from a host file supplied explicitly via the absolute `PI_COVENANT_CONFIG` environment path. The harness never scans a project for executable setup or accepts setup/approval flags as tool arguments. Without this file, project checks still work; worktree operations return an actionable configuration error.

Example host JSON (replace the absolute paths):

```json
{
  "projects": [
    {
      "id": "my-project",
      "path": "/absolute/path/to/main-checkout",
      "worktree": {
        "root": "/absolute/path/to/task-worktrees",
        "defaultBase": "main",
        "setup": { "kind": "none" },
        "requiredArtifacts": []
      }
    }
  ]
}
```

`id` is a stable safe repository namespace, not a remote service ID. Managed tasks live at `<root>/<id>/<task>`. Exactly one entry must match the canonical primary repository path; missing, duplicate or malformed configuration blocks worktree dispatch. The file must be a regular JSON file at most 256 KiB. Only explicit `none`, `after-create` or `creates-worktree` setup modes are supported. Executable modes require literal `command` and `args`, using the existing worktree module's setup semantics. Choose setup and required artifacts for the project; `none` does not claim dependencies were prepared.

```sh
PI_COVENANT_CONFIG=/absolute/path/to/host.json \
  pi -e /Users/kento/dotfiles/.pi-covenant/src/foundation/extension.ts
```

`worktree` accepts `action: new | verify | list | rm`; new takes `task` and optional `branch`/`base`, verify/rm take `path`. Optional `cwd` selects repository context relative to the Pi session. Optional `repository` must match the resolved canonical project/repository/worktree identity; arbitrary aliases are not resolved. Paths inside a linked worktree share the primary checkout's configuration. The module retains its removal protections and does not delete branches.

## Invocation and result behavior

Each call validates the complete action input, resolves local context, then dispatches one existing module. The SDK exposes an object parameter schema; Effect enforces action-specific field combinations again, including direct calls that bypass Pi validation. Only explicit host options can change the default ten-minute absolute invocation deadline (maximum one hour). Project-command timeouts still apply within that deadline. Pi cancellation is forwarded to module-owned cleanup; no generic interruption wrapper discards partial worktree effects.

Progress reports context resolution and inspection/execution stages. Per-check/live setup logs are not streamed. Final text includes actionable outcomes; display text is capped at 16 KiB and marked when truncated, while structured details preserve module reports and their existing log limits. Cancellation before dispatch is reported as cancelled; known module results remain authoritative if delivery races a later cancellation. Errors do not schedule another turn.

Context uses bounded local filesystem/Git metadata reads, not subprocesses, fetches or service queries. It chooses the nearest package/check-config project marker inside the current Git worktree, otherwise the Git root or selected non-Git directory. Linked worktrees, loose/packed refs and detached/unborn HEAD are observed where metadata is supported. Service IDs, default-branch policy, broader capabilities and project-specific auth remain unavailable. Bare repositories, reftable reference lookup and arbitrary setup/config discovery are not supported by this slice. No cache carries a previous invocation's target into another call.

## Verification and remaining work

Acceptance loads the real extension through Pi's loader, creates an isolated in-memory Pi session, confirms built-ins remain active, and executes a check through Pi's tool wrapper. Temporary real repositories test context and all four worktree actions, failed/partial results, explicit configuration, cancellation and deadlines. This does not test a paid model conversation, interactive TUI rendering or every Pi release.

Covenant verifies the integration during development only. The invocation model explores 32 finite states under three invariants; deliberate faults detect unvalidated dispatch, dispatch after stop and false success. Executable conformance bindings support those observations without claiming formal refinement or proving arbitrary filesystem/process scheduling. Run `pnpm check` for current implementation, design and fault evidence.
