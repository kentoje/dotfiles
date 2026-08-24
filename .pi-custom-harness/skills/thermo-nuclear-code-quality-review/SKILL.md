---
name: thermo-nuclear-code-quality-review
description: Perform an exceptionally strict maintainability and architecture review that looks for structural regressions and simpler designs. Use when asked for a thermo-nuclear or thermonuclear review, deep code-quality audit, or especially demanding review of a change.
disable-model-invocation: true
---

# Thermo-nuclear code quality review

Review the current branch's changes, preserving behavior while actively searching for a structural rewrite that makes the implementation smaller, more direct, and more maintainable. Do not approve merely because tests pass.

## Review bar

- Look for the code-judo move: can a better state model, ownership boundary, or composition delete whole branches, helpers, modes, or layers?
- Treat a file crossing 1,000 lines as a presumptive decomposition problem. Ask whether helpers, subcomponents, or focused modules should be extracted before accepting it.
- Reject ad-hoc conditionals, scattered special cases, and one-off flags added to unrelated flows. Prefer a dedicated abstraction, policy, state machine, or dispatcher.
- Prefer direct, boring code over magic, thin wrappers, identity abstractions, and generic mechanisms that hide simple data shapes.
- Push type and boundary cleanliness: question unnecessary optionality, `any`, `unknown`, unchecked casts, and loosely shaped objects when a typed invariant would simplify control flow.
- Keep feature logic in the canonical package or layer and reuse existing helpers instead of duplicating near-equivalents.
- Treat needless sequential orchestration and non-atomic related updates as design smells when parallel or atomic structure is clearly simpler.

## Questions for every meaningful change

1. Is there a reframing that needs fewer concepts or branches?
2. Does the diff improve or worsen local architecture and coupling?
3. Did a cohesive module become harder to scan or reason about?
4. Is the logic in the file and layer that owns the concept?
5. Did the file cross a healthy size boundary?
6. Do repeated conditionals signal a missing model or helper?
7. Is the abstraction earning its keep, or only adding indirection?
8. Did casts, optional fields, or ad-hoc object shapes obscure the real contract?
9. Could independent work stay simpler in parallel, or should related updates be atomic?

## Flag aggressively

Escalate complicated implementations where a clean reframing could delete complexity; structural refactors that only move complexity; spaghetti growth; feature logic leaking into shared code; magic fallbacks; thin wrappers; copied logic; edge cases buried in busy functions; bespoke helpers where a canonical helper exists; wrong-layer changes; and sequential or partially applied flows that make state harder to reason about.

## Preferred remedies

Recommend deleting indirection, simplifying the state model, moving ownership to the canonical abstraction, extracting a focused helper or module, replacing condition chains with typed dispatch, separating orchestration from domain logic, collapsing duplicate branches, reusing canonical utilities, making boundaries explicit, parallelizing independent work when that clarifies the flow, and making related updates atomic.

## Output

Prioritize findings: structural regressions; missed dramatic simplifications; branching complexity; boundary and type contracts; file size; modularity; then legibility. Prefer a small number of high-conviction, actionable findings over cosmetic nits. Be direct and serious without being rude. Approval requires no clear structural regression, no visible code-judo opportunity left unexplored, no unjustified file-size explosion, no spaghetti growth, no hacky abstraction, no boundary leak, and no obvious decomposition opportunity.
