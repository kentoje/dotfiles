# development-method: behavior contract

Status: specified design; all obligations draft. Kind: development-contract. Implementation and executable acceptance checks are pending.

## Purpose

Build harness behavior acceptance-first with Covenant, without imposing it on product sessions.

Keep development discipline separate from product behavior.

## Ownership

- The native obligations below

## Excluded scope

- Product runtime gates and replacement agent runtimes

## Environment and shared rules

Standard Pi hosts the tool. Installed service CLIs, credentials, Git state and project conventions are discovered, not assumed. The [shared protocol](../../docs/tool-protocol.md) governs authorization, target selection, retries, cancellation, pagination and partial effects. No pinned service version or successful authentication is assumed.

## Obligations

### DEVELOPMENTMETHOD-001

Scope: The relevant component operations and their shared prerequisites.

Must: Each implemented harness feature must have behavioral obligations and executable acceptance checks defined before its implementation is treated as complete.

Why: Keep development discipline separate from product behavior.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### DEVELOPMENTMETHOD-002

Scope: The relevant component operations and their shared prerequisites.

Must: Starting or completing an ordinary product coding task must not require running Covenant against that product.

Why: Keep development discipline separate from product behavior.

Status: draft. Record: contract.yaml; acceptance design: scenarios.yml; execution evidence: none.

### DEVELOPMENTMETHOD-003

Scope: The relevant component operations and their shared prerequisites.

Must: The harness must not add a Covenant-based runtime completion or shipping gate by default.

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

See [module interface](../../architecture/modules/development-method.json). Dependencies and operation allowlists are checked by the architecture validator. Interface changes require synchronized consumer updates and acceptance fixtures.
