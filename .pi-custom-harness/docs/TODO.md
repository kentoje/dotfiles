# Remaining work

Status as of 17 August 2026 after the Phase 0-1 vertical slice.

Design lives in `HARNESS.md` for scope and evidence, and `ARCHITECTURE.md` for module boundaries.
The two walkthroughs capture traces that corrected the design.

---

## Done

| Item | State |
| --- | --- |
| Runtime and tooling | Effect 4.0.0-beta.107, `@effect/platform-bun`, TypeBox 1.3.7, Biome, TypeScript 7, Bun test, pinned pnpm lockfile |
| `lib/git` | Pi-free `Context.Service`, tagged error, Bun `ChildProcessSpawner` live layer, and a real temporary-repository test |
| `lib/gitlab` | Pi-free `Context.Service`, tagged error, and a live `glab mr view --output json` layer |
| `extensions/mr-guard/core.ts` | Duplicate-MR guard and an unconditional changeset gate, tested against fake layers |
| `extensions/mr-guard/index.ts` | Registered `tool_call` handler narrowed with `isToolCallEventType("bash", event)` and wired to `ctx.signal` |
| Harness configuration | `settings.json`, shared `models.json` and `mcp.json` links, package list, credential and generated-state ignores, and Fish `pih` abbreviation |
| Gateway selection | Harness defaults explicitly select `llmgateway/google-vertex/gemini-3.7-flash`; `pih` completes a live gateway request |
| Core isolation | Biome rejects Pi imports outside `extensions/*/index.ts` |
| Checks | `pnpm test`: 5 passing tests; `biome check`, `tsc --noEmit`, and frozen install pass |

The harness now starts and the MR guard executes inside Pi.
Do not use it to create MRs in semantic-release repositories until the release-gate repair below lands.

---

## P0: release-gate correctness

### Make release verification repo-conditional

The current guard requires `.changeset` unconditionally.
That is correct only for hydra.

| Repository | Release gate | Current risk |
| --- | --- | --- |
| hydra | changeset | correct |
| dashboard-v4 | conventional commits | incorrectly blocked without a changeset |
| conversation-center-ext | conventional commits | incorrectly blocked without a changeset |
| analytics-extension | conventional commits | incorrectly blocked without a changeset |
| assets-page | conventional commits | incorrectly blocked without a changeset |

The four non-hydra repositories use semantic-release, where commit messages decide the published version.

**Detect the gate, do not hardcode hydra.**
Decided in review: changeset is only relevant for hydra, and the way to encode that is detection rather than a repository table.

| Signal | Gate |
| --- | --- |
| `.changeset/` exists at the repo root | `"changeset"` |
| `semantic-release` in `package.json` | `"conventional-commits"` |
| neither | `"none"`, no release gate |

Detection keeps the statement true as repos change, and removes the "unknown repository" case entirely: an absent `.changeset` directory is the answer, not a gap.

- [x] Add `lib/repo-map/core.ts` with `releaseGateFor(cwd)` and a tagged lookup error.
- [ ] Add the third gate state `"none"` to `RepositoryReleaseGate`.
- [ ] Add `lib/repo-map/live.ts` detecting the gate from the filesystem and `package.json`. Does not exist yet, so `RepoMapService` has no implementation.
- [ ] Add `GitService.commitsAreConventional`, checking every commit in `@{upstream}..HEAD`.
- [ ] Finish `guardMergeRequestCreation`. **It is currently broken mid-edit**: duplicate `const gitLabService`, an unreachable second `return`, and `pnpm check` fails with 5 errors. The `conventional-commits` branch also returns `allow` without checking anything, so the commit-message gate is not yet enforced.
- [ ] Test: changeset repo with no changeset blocks; semantic-release repo with conventional commits and no changeset allows; semantic-release repo with a non-conventional commit blocks; `"none"` repo allows.
- [ ] Run a real `pih` smoke test on a branch that already has an MR after the repair.

---

## P0: harden the Pi boundary

`mr-guard/index.ts` works, but it reimplements the Effect-to-Pi edge that every future module needs.

- [ ] Add `lib/pi-bridge` with `runHandler` and `runTool`.
- [ ] Preserve `ctx.signal` interruption.
- [ ] Map typed Git and GitLab failures to a readable fail-closed reason.
- [ ] Map defects and tool errors to `ToolResult` once the first tool module exists.

---

## P0: module discipline

- [x] Add `.purpose` for `extensions/mr-guard`.
- [ ] Add `.purpose` for `lib/git` and `lib/gitlab`.
- [ ] Decide and document the shared module shape: `core.ts`, optional `live.ts`, and extension `index.ts` only where Pi owns the boundary.
- [ ] Replace the broad import restriction with a module-aware check that rejects Pi imports specifically from `core.ts`.
- [ ] Add a check requiring `.purpose` in each harness module directory.

---

## P1: decisions that block dependent modules

- [ ] Choose the worktree root to replace `~/.maestro/worktrees/<repo>/<task>` and establish the portless route shape.
- [ ] Decide whether to retain the Claude-backed Figma MCP server or move to Figma desktop MCP.
- [ ] Decide whether `ship-gate` must require an actual render verification.

---

## P1: modules in build order

1. [ ] Extend `lib/repo-map` into the single source of truth. **Detect, do not tabulate.** Most facts are readable from the repository itself, so a hardcoded matrix would drift and would need editing for every new repo.

   | Fact | Detected from |
   | --- | --- |
   | release gate | `.changeset/` directory, `semantic-release` dependency |
   | test runner | `vitest` or `jest` in dependencies |
   | check list | `package.json` scripts: `ts:check`, `biome:check`, `test`, `graphql:check`, `fallow` |
   | dev modes | `dev`, `dev:integrate`, `dev:mock` scripts |
   | worktree setup script | `scripts/setup-worktree.sh` existing |
   | portless app name | worktree directory name |
   | **`authMode`** | **not detectable, declare it** |

   Only `authMode` needs configuration, so `repo-map` is a detector plus a small override file. New repositories then work with no edit.
2. [ ] `worktree`: `new`, `verify`, `list`, `rm`; delegate to repository setup scripts and use `withFileMutationQueue`.
3. [ ] `verify`: `types`, `lint`, `test`, `all`, backed by per-repository check lists.
4. [ ] `mr`: `status`, `threads`, `reply`, `update`, `watch`; expose `is_bot` and clear watch timers on `session_shutdown`.
5. [ ] `ticket`: `bind` and `current` only.
6. [ ] `ship-gate` and `notify-on-settle`: four checks, three-attempt cap, failures only.
7. [ ] `preview`: `url` and `up`, with sandbox, integrate, and mock modes.
8. [ ] `story`: hydra only.
9. [ ] `fleet`: `status`, `versions`, `sync`, `install`, `prune`; require `ask_user` for `sync --hard`.

---

## P2: content and polish

- [ ] Port the ten skills listed in `ARCHITECTURE.md` section 8 and rewrite each trigger from corpus wording.
- [ ] Measure cold start before and after Effect-backed extension loading.
- [ ] Enumerate ponytail's registered surface for the tool census.
- [ ] Write `APPEND_SYSTEM.md` last after dumping and subtracting the assembled system prompt.

---

## Watch items

- Effect 4 and TypeScript 7 are beta releases.
  Keep exact dependency versions pinned.
- `glab mr view` classifies a missing MR by matching its current text output.
  Prefer a structured `glab mr list --source-branch` fallback if that output changes.
- `git diff @{upstream}...HEAD` and the planned commit range fail before an upstream exists.
  The Pi bridge must turn that into a useful blocking reason rather than an unhandled handler failure.
