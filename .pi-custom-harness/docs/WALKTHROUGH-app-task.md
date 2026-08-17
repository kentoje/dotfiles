# Walkthrough: a regular app task, end to end

The companion to `WALKTHROUGH-figma-task.md`.
That one traced a Storybook component in hydra.
This one traces the more common case: a product change in an app surface with no Storybook.

**Scenario.** `CI-6600`, "Duration filter shows the wrong label when only one bound is set".
Repo: `dashboard-extensions/conversation-center-ext`.
Taken from a real task in the corpus: "if from is 5, and to is 5, we should display `5 min`".

Design input is a pasted screenshot, not Figma.

---

## Why hydra was the wrong repo to design against

Read from the five repositories on disk:

| Repo | Release | Commit lint | Tests | Storybook | Dev server |
| --- | --- | --- | --- | --- | --- |
| hydra | changesets | yes | vitest | **yes** | Storybook |
| conversation-center-ext | semantic-release | yes | jest | no | `rsbuild dev` |
| dashboard-v4 | semantic-release | no | jest | no | app dev server |
| analytics-extension | semantic-release | no | jest | no | app dev server |
| assets-page | semantic-release | no | vitest | no | app dev server |

**Hydra is the outlier on every axis.**
It is the only repo with Storybook and the only one with changesets.
Four of five ship through semantic-release, which means the version bump rides on the commit message rather than a changeset file.

Three corrections follow, recorded in HARNESS.md:

1. The `mr-guard` changeset check is **hydra-only**. Elsewhere the equivalent gate is a conventional commit message.
2. `story` serves one repository. `preview` serves four. Their build priority should reflect that.
3. `verify` needs a per-repo **check list**, not just a runner name. This repo has five checks, two of which are bespoke.

---

## The pipeline

| # | Step | Layer | Call |
| --- | --- | --- | --- |
| 1 | Read the ticket | bash | `jira issue view CI-6600` |
| 2 | Create and provision the worktree | tool | `worktree new CI-6600` |
| 3 | Bind ticket to branch | tool | `ticket bind CI-6600` |
| 4 | Reference for the expected output | human | pasted screenshot, no Figma |
| 5 | Locate the component | tool | `ffgrep "duration"`, `code_find` |
| 6 | Read current formatting logic | tool | `read`, `code_inspect` |
| 7 | Start the dev server | tool | `preview up --mode mock` |
| 8 | Open the app | skill | `agent-browser` at the portless URL |
| 9 | Reproduce the bug | skill | drive to the filter, capture the wrong label |
| 10 | Fix the formatting | tool | `edit` |
| 11 | Conventions | skill | `typescript-best-practices`, `write-discoverable-code` |
| 12 | Re-render and capture | skill | `agent-browser` screenshot |
| 13 | Compare to step 4 | **human** | by eye |
| 14 | Iterate 10 to 12 | - | |
| 15 | Unit test the edge cases | tool | `write` a jest case per bound combination |
| 16 | Full check | tool | `verify all` |
| 17 | Conventional commit | bash | `git commit -m "fix(filters): ..."` |
| 18 | Push | bash | `git push -u origin CI-6600` |
| 19 | Open the MR | bash | `glab mr create ...` |
| 20 | **Guard fires** | handler | `mr-guard`: no existing MR, commit message conventional |
| 21 | Watch the pipeline | tool | `mr watch` |
| 22 | Wake on settle | handler | `sendMessage(followUp, triggerTurn)` |
| 23 | Read review threads | tool | `mr threads --unresolved` |
| 24 | Triage bot findings | human | `is_bot` splits Bugbot from human review |
| 25 | Fix and resolve | tool | `mr reply --thread <id> --resolve` |
| 26 | **Ship-gate fires** | handler | MR, threads, ticket, verify |
| 27 | Notify only if blocked | handler | `notify-on-settle` |

---

## What differs from the Storybook trace

| | Storybook task (hydra) | App task (this one) |
| --- | --- | --- |
| Design input | Figma MCP, 3 calls, ~$0.12 | Pasted screenshot, free |
| Render surface | `story show` | `preview up` plus `agent-browser` |
| Isolation | One component, no app state | Full app, needs data to reach the state |
| Auth | `authMode: none` | `authMode: dev-plugin`, `build/dev-auth.ts` handles it |
| Reproduce first | not applicable, new component | **required**, step 9 |
| Release artefact | `.changeset/*.md` | conventional commit message |
| Test runner | vitest | jest with `@swc/jest` |
| Extra checks | none | `graphql:check`, `fallow` |

**The reproduce-first step is the real difference.**
A new component has nothing to reproduce.
A bug fix does, and your own standing instruction is to reproduce end to end before fixing, so step 9 is not optional.

---

## Two things this repo already solved

**Worktree provisioning is not the harness's to invent.**
`scripts/setup-worktree.sh` and `scripts/new-worktree.sh` already exist here, built to work on any machine.

So `worktree new` should **call the repo's script when one exists**, then add what the repo cannot know: portless registration and the `verify` pass.
HARNESS.md 5.2 said the tool "encodes certs, `.env.local`, `node_modules`, GraphQL schema".
That was wrong for this repo. It should delegate and then verify.
`lib/repo-map` holds which script to call.

**`dev:mock` gives deterministic UI states.**
`PUBLIC_ENABLE_MSW=true` runs the app against MSW.
For a task that is entirely about edge cases in a display rule, driving real data to produce "from is 5, to is 5" is slow and flaky.
That is why step 7 uses `--mode mock`.

`preview up` therefore needs a mode argument, which HARNESS.md 5.4 did not have:

```
preview up [--mode sandbox|integrate|mock]
```

`lib/repo-map` owns the per-repo mode list, since these names are conversation-center-ext's and other repos differ.

---

## What `verify all` runs here

Five checks, not three:

| Check | Command |
| --- | --- |
| types | `pnpm ts:check` (`tsgo --noEmit`) |
| lint | `pnpm biome:check` |
| tests | `pnpm test` (jest) |
| graphql | `pnpm graphql:check` (gql-tada) |
| fallow | `pnpm fallow` |

The last two are bespoke, and `fallow` is a check you have hit in CI before: "fallow check is failing on ... fix it".
A `verify` tool that only knows types, lint and test would let that reach the pipeline.

This is the clearest argument for `lib/repo-map` being a check list per repo rather than a runner name per repo.

---

## Where you steer

Same shape as the Storybook trace, with one addition and one removal.

| Step | Decision | Change from the Storybook trace |
| --- | --- | --- |
| 4 | Supplying the reference | New. No Figma, so the expected output comes from you. |
| 9 | Confirming the reproduction is the real bug | New. Guards against fixing a symptom. |
| 13 | Does the render match | Same. Still no diff tool. |
| 24 | Is the Bugbot finding real | Same. |
| - | Changeset bump level | **Removed.** semantic-release derives it from the commit message, so the judgement moves into step 17 and commitlint enforces the shape. |

Step 17 is worth noting: on this repo the commit message *is* the release decision.
`fix:` versus `feat:` versus a breaking-change footer changes the published version.
That is the same class of judgement as the changeset bump level in hydra, wearing different clothes, and it is equally not automatable.

The forced-stop count is still zero, and the ship-gate is still blind to whether the fix looks right.
