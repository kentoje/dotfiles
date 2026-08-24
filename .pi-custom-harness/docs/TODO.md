# Remaining work

Status as of 20 August 2026 after the release-gate vertical slice.

`HARNESS.md` defines scope and evidence. `ARCHITECTURE.md` defines module boundaries, isolation, build order, and prompt assembly. The two walkthroughs are design traces that corrected the original plan.

The implemented slice is runnable, but the end-to-end harness described by the walkthroughs is not complete.

---

## Implemented baseline

| Area | Implemented state |
| --- | --- |
| Runtime and tooling | Effect `4.0.0-beta.107`, `@effect/platform-bun`, TypeBox `1.3.7`, Biome, TypeScript 7, Bun test, pinned pnpm lockfile |
| Harness configuration | `settings.json`, `models.json`, `mcp.json`, package list, project isolation flags, credential/generated-state ignores, and Fish `pih` abbreviation |
| Gateway | `llmgateway` configuration and a successful non-interactive Pi gateway smoke test |
| `lib/git` | Pi-free `GitService`, tagged lookup error, Bun `ChildProcessSpawner` live layer, default-branch resolution, policy-aware release readiness, publishable-package changeset inspection, conventional-commit detection, and real temporary-repository tests |
| `lib/gitlab` | Pi-free `GitLabService`, tagged lookup error, and structured `glab mr list --source-branch --state opened --output json --fields iid` lookup with deterministic transport tests |
| `lib/repo-map` | Full `RepoMapService` facts detection with the canonical typed `RepositoryDeliveryPolicy`, verification policy, runner, checks, dev modes, setup script, portless route, worktree root, auth overrides, and fleet repositories |
| `extensions/mr-guard` | Duplicate-MR guard and policy-aware release verification through Git, GitLab, and repo-map services |
| Pi extension boundary | Bash `tool_call` narrowing with `isToolCallEventType`, live-layer wiring, `ctx.signal` passed to Effect execution, and shared bridge error mapping |
| Core isolation | Biome's module-aware Pi import restriction plus the harness module `.purpose` contract validator |
| Tests | 115 passing tests across the runnable harness test command; 237 assertions |
| Verification | `pnpm check`, `pnpm test`, and module-contract validation pass |

The guard must not be treated as production-safe for MR creation until the real-MR smoke test is complete.

---

## P0: finish and harden the Pi boundary

### Add `lib/pi-bridge`

- [x] Add `lib/pi-bridge` with `runHandler` and `runTool`.
- [x] Centralize `Effect.runPromise` at the Pi boundary.
- [x] Preserve `ctx.signal` interruption and verify cancellation behavior.
- [x] Map `GitChangesetLookupError`, `GitLabMergeRequestLookupError`, and `RepositoryFactsLookupError` to readable fail-closed reasons.
- [x] Map Effect defects and unexpected failures to a safe Pi result instead of an unhandled handler rejection.
- [x] Map tool failures to Pi `ToolResult` once the first registered tool exists.
- [x] Route `mr-guard/index.ts` through the bridge instead of reimplementing the edge locally.
- [x] Add bridge tests for success, typed failure, defect, and abort paths.

### Exercise the live MR guard

- [ ] Run a real `pih` smoke test on a branch that already has an MR after the bridge repair.
- [ ] Verify duplicate-MR blocking against a real GitLab MR without creating a new MR.
- [ ] Verify the live semantic-release and changeset gates against representative repositories without creating MRs.
>
> **CI-6618 incident, 21 August 2026.** Hydra MR !6038 was opened outside the recorded custom-harness session, so `mr-guard` did not intercept its `glab mr create` command. The MR merged without a `.changeset` file. `ship-gate` now independently blocks delivery when a changeset repository lacks a branch changeset, so bypassing the pre-create guard cannot produce a clean delivery state.

---

## P0: module discipline and verification hygiene

### Module contracts

- [x] Add `.purpose` for `lib/git`.
- [x] Add `.purpose` for `lib/gitlab`.
- [x] Add `.purpose` for `lib/repo-map`.
- [x] Decide and document the shared module shape: `core.ts`, optional `live.ts`, colocated tests, `.purpose`, and `index.ts` only where Pi owns the boundary.
- [x] Add a check requiring `.purpose` in every harness module directory.
- [x] Replace the broad Pi import restriction with a module-aware rule that rejects Pi imports specifically from `core.ts` and shared Effect modules.
- [x] Ensure each future tool has the documented `schema.ts` / `index.ts` / `core.ts` / `core.test.ts` shape.

### Existing check failures and coverage gaps

- [x] Resolve the remaining full-Biome diagnostics: formatting/import organization in `extensions/mr-guard/core.ts`, `extensions/mr-guard/core.test.ts`, `lib/git/live.test.ts`, `lib/repo-map/core.ts`, `lib/repo-map/live.test.ts`, `package.json`, and `settings.json`.
- [x] Make `pnpm test` include the repo-map live tests rather than only `extensions/mr-guard` and `lib/git`.
- [x] Add dedicated GitLab live-layer coverage or a deterministic subprocess fixture for JSON decoding and missing-MR classification.
- [x] Replace text matching in `glab mr view` missing-MR detection with a structured `glab mr list --source-branch` fallback if the CLI output changes.

---

## P1: decisions blocking dependent modules

- [ ] Choose the replacement for `~/.maestro/worktrees/<repo>/<task>` and document the worktree root.
- [ ] Establish the portless route shape derived from the selected worktree root and app name.
- [ ] Decide whether to retain the Claude-backed Figma MCP server or move to Figma desktop MCP at `127.0.0.1:3845`.
- [ ] Decide whether `ship-gate` requires actual render verification, a forced `ask_user` visual review, or human supervision only.
- [ ] Decide where ticket bindings live: per-worktree `.dev-flow.json`, central `~/.pi/agent/bindings.json`, or central storage with a per-worktree cache.
- [ ] Classify every repository's `authMode`: `none`, `dev-plugin`, or `browser-login`.
- [ ] Define how ship-gate false positives will be measured, especially ticket-binding and verify-freshness failures.

### Walkthrough gaps requiring a decision or implementation

- [ ] Decide whether to add a narrow `ds tokens` capability that maps Figma variable names to `@aircall/ds` token names; the Figma walkthrough identifies this as an unresolved gap not covered by generic code search.
- [ ] If render verification is selected, define and implement the reference-render comparison workflow; the Figma walkthrough currently leaves this as manual visual comparison with no diff tool.
- [ ] Define the failure/recovery contract when `mr watch` loses its notification because the Pi session ends before pipeline settlement.
- [ ] Decide whether a Figma-backed task needs a forced human visual-review stop; the current trace has no forced stop, but visual match remains a human judgment.

### Prompt and search configuration outside the harness directory

- [ ] Update `~/dotfiles/.pi/agent/AGENTS.md` so FFF guidance states: use `ffgrep`/`fffind` inside a Git repository, and built-in `grep`/`find` outside one.
- [ ] If the Claude-backed Figma MCP remains selected, remove or parameterize the machine-specific `/Users/kento/.claude/mcp-servers/` path so the harness's documented portability goal is explicit.

---

## P1: extend `lib/repo-map` into the single source of truth

Detect repository facts from the repository where possible. Do not hardcode a repository matrix that needs editing for every new repository. Declare only facts that cannot be detected.

- [x] Detect the test runner from `vitest` or `jest` dependencies/scripts.
- [x] Detect the complete check list from `package.json` scripts, including `ts:check`, `biome:check`, `test`, `graphql:check`, and `fallow` where present.
- [x] Detect dev modes from `dev`, `dev:integrate`, and `dev:mock` scripts.
- [x] Detect whether `scripts/setup-worktree.sh` or the repository's equivalent setup script exists.
- [x] Detect the portless app name from the worktree directory name or the selected repository configuration.
- [x] Add declared per-repository `authMode` overrides because auth mode is not reliably detectable.
- [x] Add the selected worktree-root and portless-route configuration.
- [x] Expose the repository list needed by `fleet`.
- [x] Add tests for each detected fact and for missing/invalid package metadata.

---

## P1: implement the modules in build order

### `worktree`

- [x] Add the `worktree` extension and `.purpose` contract.
- [x] Implement `new`.
- [x] Implement `verify`.
- [x] Implement `list`.
- [x] Implement `rm`.
- [x] Delegate provisioning to the repository setup script when one exists.
- [x] Add the fallback provisioning path for repositories without a setup script.
- [x] Add portless registration after provisioning.
- [x] Run the repository-specific verification pass after creation.
- [x] Verify a throwaway worktree without reading developer-home state.
- [x] Use `withFileMutationQueue` around absolute-path file mutations.
- [x] Add tests for setup-script delegation, fallback setup, verification failure, list, and removal.

### `verify`

- [x] Add the `verify` extension and `.purpose` contract.
- [x] Implement `types`.
- [x] Implement `lint`.
- [x] Implement `test`.
- [x] Implement `all`.
- [x] Back commands with the per-repository check lists from `repo-map`.
- [x] Return structured results: `{ ok, failures: [{ file, line, rule, message }], duration }`.
- [x] Preserve command output and actionable failure details without relying on truncated shell tails.
- [x] Add tests for individual checks, all-check ordering, missing scripts, and failure aggregation.

### `mr`

MR creation remains Bash plus `mr-guard`; do not add an `open` action.

- [x] Add the `mr` extension, schema, core, tests, and `.purpose`.
- [x] Implement `status` with IID, title, draft state, discussion state, pipeline state, unresolved count, and bound ticket.
- [x] Implement `threads` with ID, author, `is_bot`, file, line, body, and resolved state.
- [x] Implement `reply` with optional resolution.
- [x] Implement `update` by regenerating title and description from commits.
- [x] Implement `watch` and inject a message when the pipeline settles.
- [x] Clear watch timers on `session_shutdown`.
- [x] Ensure watch cancellation and shutdown cannot wake the wrong session.
- [x] Add deterministic fake-service tests.
- [ ] Run a safe live GitLab boundary test on the current branch with an open MR.

### `ticket`

- [x] Add the `ticket` extension, schema, core, tests, and `.purpose`.
- [x] Implement `bind <KEY>`.
- [x] Implement `current` from the branch association.
- [x] Implement the selected binding storage strategy.
- [x] Add tests for binding, lookup, missing binding, worktree deletion, and malformed state.

### `ship-gate`

- [x] Add the `ship-gate` handler and `.purpose` contract.
- [x] Run on `agent_settled`.
- [x] Check for commits ahead of the base branch with no MR.
- [x] Check for unresolved MR discussion threads.
- [x] Check for a bound ticket.
- [x] Check that policy-required verification evidence passed after the last edit: `verify all` for repository-wide repositories or focused `verify test --file …` for focused-only repositories.
- [x] Treat an unsettled pipeline watch as a hold condition where appropriate.
- [x] Send a follow-up with `deliverAs: "followUp"` and `triggerTurn: true` when blocked.
- [x] Cap retries at three attempts.
- [x] Record which check blocked each attempt for false-positive measurement.
- [ ] Implement the decided render-verification policy, if required.
- [x] Add tests for every check, retry cap, clean completion, and repeated failure.

### `notify-on-settle`

- [x] Add the handler and `.purpose` contract.
- [x] Notify only on ship-gate failure or a red pipeline.
- [x] Stay silent on clean completion.
- [x] Reuse the intended notify/Slack integration without adding success noise.
- [x] Add tests for failure notifications, red pipelines, clean completion, and duplicate suppression.

### `preview`

- [x] Add the `preview` extension, schema, core, tests, and `.purpose`.
- [x] Implement `url`.
- [x] Implement `up`.
- [x] Support sandbox, integrate, and mock modes where the repository exposes them.
- [x] Resolve and validate the current worktree's portless URL.
- [x] Start the correct repository dev command through portless when needed.
- [x] Report `{ url, running, authMode, mode }`.
- [x] Use `authMode` to determine whether browser-login preparation is required.
- [x] Add tests for mode selection, route readiness, already-running servers, startup failure, and auth-mode reporting.

### `story`

Scope is Hydra only.

- [x] Add the `story` extension, schema, core, tests, and `.purpose`.
- [x] Implement `list <component>`.
- [x] Implement `show <component> [--story] [--viewport] [--theme]`.
- [x] Resolve the worktree's Storybook portless URL.
- [x] Target the preview iframe directly rather than the Storybook manager chrome.
- [x] Return screenshot, resolved URL, and console errors.
- [x] Add tests for story lookup, URL construction, viewport/theme options, and render failures.

### `fleet`

- [x] Add the `fleet` extension, schema, core, tests, and `.purpose`.
- [x] Implement `status` with branch, dirty state, ahead/behind state, and open MRs per repository.
- [x] Implement `versions <pkg>` across repositories.
- [x] Implement `sync`.
- [x] Implement destructive `sync --hard` only after printing the pending work and confirming through `ask_user`.
- [x] Implement `install` across repositories.
- [x] Implement `prune` for orphaned portless dev servers.
- [x] Use the repository list from `repo-map`.
- [x] Add tests for clean/dirty repos, version differences, sync safety, install failure, and orphan pruning.

---

## P2: port harness skills and rewrite triggers

The harness skills directory contains the ten hermetic skills below; global skill discovery is not used in hermetic mode.

Port and review these ten skills into `.pi-custom-harness/skills/`:

- [x] `write-discoverable-code`
- [x] `typescript-best-practices`
- [x] `aircall-hydra-ui-lib`
- [x] `vercel-react-best-practices`
- [x] `vercel-composition-patterns`
- [x] `agent-browser`
- [x] `agent-browser-aircall-local`
- [x] `thermo-nuclear-code-quality-review`
- [x] `grill-me`
- [x] `herdr`

For every ported skill:

- [x] Rewrite the trigger description from real corpus wording rather than copying the old trigger.
- [x] Preserve only the guidance relevant to the hermetic harness.
- [x] Verify the skill loads through the explicit `--skill` path; prompt evidence confirmed ten skills on disk and nine exposed in the model catalogue.
- [x] Confirm retired skills are not accidentally reintroduced: `aircall-dev-flow`, `aircall-dev-flow-maestro`, `gitlab-create-merge-request`, and `agent-browser-storybook-dev`.

---
## P2: prompt, measurement, and documentation completion

- [ ] Measure Pi cold start before Effect-backed extension loading.
- [ ] Measure Pi cold start after Effect-backed extension loading.
- [ ] Decide whether lazy-loading is necessary based on the measured regression.
- [ ] Enumerate ponytail's registered tools and finish the tool census.
- [ ] Run a real session with the completed modules and dump the assembled system prompt using `ctx.getSystemPrompt()`; agent-prompt evidence confirmed this API is runtime-hook-only.
- [x] Write `APPEND_SYSTEM.md` last, after subtracting the default header, module prompt snippets/guidelines, and skills catalogue; the artifact exists and loads in the prompt-evidence session.
- [x] Include only the remaining composition rules, tool-versus-Bash guidance, enforced invariants, search-tool condition, voice/code standards, and bug/UI standards.
- [x] Do not duplicate generated tool lists, skills lists, or module-local guidance in `APPEND_SYSTEM.md`.
- [x] Update stale status headers in `HARNESS.md` and `ARCHITECTURE.md` that still say the harness is blueprint-only or that no implementation exists.
- [ ] Keep both walkthroughs aligned with the actual implemented phases and mark their unimplemented steps as design-only until the corresponding modules land.

---


## Known risks and follow-ups

- [ ] Keep Effect 4 and TypeScript 7 pinned while they remain beta releases.
- [ ] Handle Git range checks cleanly when no upstream/default branch exists; the Pi bridge must turn this into a useful blocking reason rather than an unhandled handler failure.
- [ ] Revisit `git diff @{upstream}...HEAD` and planned commit ranges after worktree and verify modules exist.
- [ ] Revisit GitLab missing-MR classification if `glab` changes its output.
- [ ] Do not claim the full harness is complete based only on the passing MR-guard slice.
- [ ] Re-run the full test suite and full Biome check after each module phase, not only the new module's focused tests.

---

## Deliberately out of scope

These are documented decisions, not TODO items:

- No `pi-subagents` package or subagent roles for now.
- No `agent-browser` wrapper.
- No `portless` wrapper; `preview` owns the decision layer above the CLI.
- No changeset generator; the model writes the changeset and the guard verifies its existence.
- No broad DS lookup tool; use code intelligence and skills.
- No heavy-command lock unless concurrent worktree usage returns to three or more active worktrees.
- No build step; Bun executes TypeScript directly unless measured cold-start cost justifies revisiting this.
- No Effect Schema for Pi tool parameters; Pi requires TypeBox `TSchema`.
