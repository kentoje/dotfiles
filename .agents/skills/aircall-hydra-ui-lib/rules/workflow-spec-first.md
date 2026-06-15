# workflow-spec-first

> Paths and slash-commands below are relative to / live in the **Aircall Hydra monorepo**
> (`<hydra>` = the Hydra repo root). `/build-ds-component` and `/compare-with-figma` are
> Hydra-repo skills (`<hydra>/.agents/skills/`), not part of this dotfiles skill.

For a **non-trivial new `@aircall/ds` primitive**, don't free-hand it — run the
`/build-ds-component` skill. The workflow is spec-first and verification-gated:

1. **Investigate (no code).** Read the Figma node(s) for tokens/states/variants. Read every
   real call-site end-to-end (not just its prop interface — the render scope; side-channel
   callbacks and library hacks only surface on a full read). Grep DS conventions for naming
   and composition before proposing anything.
2. **Write `<hydra>/specs/<name>.spec.md` and STOP for approval.** It must include a
   **§6 Composition rules** section (the hard rules consumers can rely on) and a §4 proposed
   API. The spec is the source of truth; don't produce it only in chat.
3. **Implement** to match the approved spec: component → stories → export in `index.ts` →
   `pnpm --filter @aircall/ds run lint`.
4. **Self-verify** with `/compare-with-figma` per story (≤3 iters each) and run a11y via the
   Storybook MCP — **a11y is a gate, not a side-quest**.
5. **Report + persist learnings** to `<hydra>/packages/ds/.agents/learnings/`.

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
