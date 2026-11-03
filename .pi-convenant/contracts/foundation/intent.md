# foundation: behavior contract

Status: specified design; all obligations draft. Kind: development-contract. Implementation and executable acceptance checks are pending.

## Purpose

Preserve standard Pi while adding the agreed tools and controls.

Keep development discipline separate from product behavior.

## Ownership

- The native obligations below

## Excluded scope

- Product runtime gates and replacement agent runtimes

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### FOUNDATION-001

Scope: The relevant component operations and their shared prerequisites.

Must: The harness runs as extensions and configuration of standard Pi rather than replacing its standard interaction model.

Why: Keep development discipline separate from product behavior.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FOUNDATION-002

Scope: The relevant component operations and their shared prerequisites.

Must: Harness implementation must not copy, import or depend on implementation code from /Users/kento/dotfiles/.pi-custom-harness.

Why: Keep development discipline separate from product behavior.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### FOUNDATION-003

Scope: The relevant component operations and their shared prerequisites.

Must: The harness preserves standard Pi capabilities unless the user explicitly agrees to a capability change.

Why: Keep development discipline separate from product behavior.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

## Decisions

See [decisions.yml](decisions.yml) for provenance, alternatives and revisit conditions. Numeric limits and paths marked specified-default are authored, revisable design choices rather than user approvals.

## Known limits

- No executable implementation or passing evidence exists yet.

## Regeneration brief

Preserve obligation IDs and explicit user decisions. Implement one behavior slice with a failing acceptance check, then the smallest working change. Exercise failure and partial-effect cases before activation. Keep bindings empty until real checks exist. Do not copy the former harness implementation.

## Sources

- Current user design conversation; repository design boundaries in AGENTS.md.

## Enforced module boundary

See [module interface](../../architecture/modules/foundation.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
