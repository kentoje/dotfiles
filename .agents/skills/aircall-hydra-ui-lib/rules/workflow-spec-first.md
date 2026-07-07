# workflow-spec-first

> Paths and slash-commands below are relative to / live in the **Aircall Hydra monorepo**
> (`<hydra>` = the Hydra repo root). `/build-ds-component` and `/compare-with-figma` are
> Hydra-repo skills (`<hydra>/.agents/skills/`), not part of this dotfiles skill.

For a **non-trivial new component — `@aircall/ds` primitive OR `@aircall/blocks`
composition — or an API refactor**, don't free-hand it. The workflow is API-first and
verification-gated:

1. **Investigate (no code).** Read the Figma node(s) for tokens/states/variants. Read every
   real call-site end-to-end (not just its prop interface — the render scope; side-channel
   callbacks and library hacks only surface on a full read). Read the **primitive you'll
   compose** (for blocks, the ds component + its exported types) and grep **sibling
   components** for naming/composition before proposing anything.
2. **Propose the API and converge before coding.** Present **2-3 candidate API shapes**, each
   with a **call-site sketch** and a short **trade-off table**, plus your **recommendation**.
   Settle the recurring forks explicitly (see `api-design-checklist`). Iterate with the
   requester until one shape is agreed — **this is the gate; don't write component code until
   the API is agreed.** For a **ds primitive**, capture the agreed API in
   `<hydra>/specs/<name>.spec.md` (with a **§6 Composition rules** section) via
   `/build-ds-component`. For a **blocks** component, a short in-conversation proposal is
   enough — the agreed call-site sketches are the spec.
3. **Implement** to match the agreed API: component → stories → export in `index.ts` →
   `pnpm --filter @aircall/{ds,blocks} run lint`.
4. **Self-verify** with `/compare-with-figma` per story (≤3 iters each). a11y runs with the
   story tests but is **report-only by default** — see `testing-stories-are-tests` for how to
   gate a clean component (`a11y: { test: 'error' }`).
5. **Report + persist learnings** to `<hydra>/packages/{ds,blocks}/.agents/learnings/`.

## When NOT to use the full workflow

- Trivial variant additions (new size/color) → just edit + add a story.
- Pure restyle, no API change → skip the spec phase.
- Wrapping an existing DS primitive *inside an app* → that belongs in the app, not ds (and
  composing primitives into a reusable higher-level piece belongs in `@aircall/blocks` — see
  `blocks-compose-ds`).

## Always

- **Use the Storybook MCP** (`ds-storybook-mcp` :6008 / `blocks-storybook-mcp` :6009) to
  verify any prop before using it. Never hallucinate component properties.
- **Decide-and-log, don't ask.** For reasonable naming/styling calls, pick one and record it
  in the spec's resolved-decisions section; only escalate genuinely 50/50 or expensive-to-
  reverse choices. A grep beats a round-trip.
