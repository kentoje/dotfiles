---
name: write-discoverable-code
description: Make symbols, files, and diagnostics easy to locate through plain-text search. Use when adding, moving, renaming, or reviewing functions, types, constants, files, error messages, or documentation.
---

# Write discoverable code

Coding agents discover code by searching for strings and reading small windows around hits. Names and nearby comments should make the implementation resolvable in one search instead of five.

## Names are search queries

- Give exported symbols 2–4 word names, including a domain word: `diffUserObjects`, not `diff`; `queueEventForDispatch`, not `queue`.
- Give generic verbs their object: `sanitizeEmailHtml`, not `sanitize`. Qualify only as far as search uniqueness requires.
- Keep one definition site per symbol. Move a shared helper and delete the original in the same change.
- Do not rely on the module path to disambiguate generic names. Put the context in the symbol (`formatDurationMs`), except where a rigid repository convention makes a generic name meaningful.
- Use one spelling for one concept (`organizationId` or `orgId`) throughout a codebase. Reuse vocabulary already present.
- Rename when behavior, audience, or visibility changes; stale names are misinformation.
- Domain-prefix filenames. Prefer `billing-plan-config.ts` over bare `config.ts`, `types.ts`, `utils.ts`, or `helpers.ts`; a thin `index.ts` re-export is fine.

## Types carry searchable contracts

- Brand primitive IDs so different concepts cannot be interchanged: `type AgentId = string & { readonly __brand: "AgentId" }`.
- Use capability-token types for privileged operations instead of comments or raw connections.
- Model state with discriminated unions rather than nullable-field clusters.
- Name types as they should appear in compiler errors (`OrgScopedDb`, not `Ctx2`). Avoid `any`.

## Say it where search lands

- Put a one-line doc comment on every export, stating the sharp constraint the type cannot show: units, timezone, ordering, ownership, or source of a timestamp.
- Include the plain-language search phrase in that comment. A `SessionExpiryChecker` comment should say that it checks whether a user session has expired.
- Imports plus their doc comments should explain the module without opening every imported source file.
- Keep event names, flags, and error codes as whole literals. Do not construct searchable strings with interpolation when the complete value is known.
- Start error messages with a unique literal prefix so a log line searches directly to its throw site.
- Give each file one searchable concept and keep orchestrators thin. Put question-sized behavior in a module named for that behavior; keep helpers that only clarify one local concept inline.
- Colocate tests (`foo.test.ts` beside `foo.ts`) so behavior and specification are found together.
- Mark retained old paths `@deprecated` and point to the replacement.

## Before committing

1. Does one search for each new exported name find its implementation?
2. Would swapping function arguments fail through branded or structured types?
3. Is the key unit, timezone, ownership, ordering, or source constraint documented at the definition?
4. Do all log and error strings exist verbatim in source?
5. Did a behavior change also receive a name change where needed?
6. When code moved, is the old definition gone?
