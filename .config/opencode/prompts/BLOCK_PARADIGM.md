You operate under the **Block Architecture with Metadata** paradigm.

## Core Philosophy

**Metadata = intent. Contract = types. Implementation = disposable.**

Every self-contained unit of functionality (a "block") carries a machine-readable `metadata.json` describing its purpose, constraints, dependencies, and exports. You can understand any block by reading ONLY `metadata.json` and the contract file — without ever looking at implementation. Implementations can be regenerated from scratch using just metadata + contract as specification.

## Block Structure

Blocks live in a dedicated directory (typically `src/blocks/`). Each block is a **kebab-case directory** containing:

| File | Purpose |
|------|---------|
| `metadata.json` | Identity, intent, constraints, dependencies, exports manifest |
| Contract file (`contract.*`) | Types, interfaces, or function signatures — required for ALL kinds |
| Impl file(s) (`impl.*` or `impl.{name}.*`) | Runtime code satisfying the contract |

## Block Kinds (4 kinds)

| Kind | Contract | Implementation | Purpose |
|------|----------|---------------|---------|
| `domain` | required | **none** (pure types) | Entity types and value objects |
| `service` | required | Named adapter(s): `impl.{name}.*` | Interface + swappable implementations |
| `utility` | required | Single: `impl.*` | Pure functions with type signatures |
| `workflow` | required | Single: `impl.*` | Orchestrates multiple blocks |

## Metadata Schema (7 fields)

```json
{
  "id": "namespace.block-name",
  "kind": "domain | service | utility | workflow",
  "responsibility": "What this block does, in plain language",
  "constraints": [
    "Behavioral rules the implementation MUST follow",
    "These enable regeneration — be specific and exhaustive"
  ],
  "depends_on": ["namespace.other-block"],
  "exports": {
    "contract": [
      { "name": "SymbolName", "type": "function | type | interface | const | class" }
    ],
    "impl": [
      { "name": "symbolName", "type": "function" }
    ]
  },
  "tags": ["searchable", "labels"]
}
```

### Field rules

- **`id`** — Primary key. Globally unique. Immutable. NEVER change an id.
- **`kind`** — Determines which files are required/allowed.
- **`responsibility`** — What the block does. Used for search and agent comprehension.
- **`constraints`** — Behavioral rules any implementation MUST satisfy. These are the spec that enables regeneration. Be specific.
- **`depends_on`** — Block `id` values (not file paths) this block may import from. Enforced by validation.
- **`exports`** — Maps filenames (minus extension) to symbols they export. `"contract"` → contract file, `"impl.memory"` → `impl.memory.*`. Every source file in the block MUST appear; every entry MUST correspond to a real file.
- **`tags`** — Searchable labels for discovery.

## Import & Dependency Rules

1. A block may ONLY import from blocks listed in its `depends_on`.
2. Type-only imports must use the language's type import syntax.
3. Circular dependencies are FORBIDDEN.
4. Import specific files (contract or impl), never barrel/index files.

## Default Workflow

For EVERY task, follow this order:

1. **Search first** — Find the right block(s) via CLI or metadata search. Never guess which block to edit.
2. **Read `metadata.json` before implementation** — Understand intent, constraints, and dependencies first.
3. **Choose the right operation** — Create, regenerate, evolve, or split (see below).
4. **Smallest change possible** — Edit the fewest blocks needed.
5. **Validate** — Run validation after every change.
6. **Test** — Run tests after behavioral changes.

## Operations

### 1. Create a new block

1. Create a kebab-case directory under the blocks directory.
2. Write `metadata.json` with meaningful `id`, `responsibility`, `constraints`, `depends_on`, `exports`, `tags`.
3. Write the contract file defining the block's public types/signatures.
4. Write impl file(s) satisfying the contract (skip for `domain` kind).
5. Validate.

### 2. Regenerate an implementation

When impl is broken, needs rewriting, or needs a different approach.

1. Read `metadata.json` — responsibility, constraints, dependencies, required exports.
2. Read contract — type signatures the impl must satisfy.
3. **DO NOT modify contract or metadata.** If regeneration requires a contract change, use Evolve instead.
4. Delete old impl file(s).
5. Rewrite from scratch, satisfying all contract types and all metadata constraints.
6. Only import from blocks in `depends_on`.
7. Validate and test.

### 3. Evolve a contract

Changing a contract affects ALL dependent blocks.

1. **Find ALL dependents** — search every `metadata.json` for `depends_on` containing this block's id. Recurse for transitive dependents.
2. **Plan cascading changes BEFORE editing** — list every affected block and what changes.
3. **Update order: leaves first, then up the dependency tree.**
4. Update the source block (contract + metadata if needed). Preserve the `id`.
5. Update each dependent in dependency order.
6. Validate and test.

Guidelines:
- Prefer additive changes (new optional fields) over breaking changes.
- If breaking, update ALL dependents in the same operation.
- Never change an `id`. If purpose fundamentally changes, create a new block.

### 4. Split a block

Trigger: block exceeds ~200 LOC or has multiple responsibilities.

1. Identify split boundary — which exports move, which stay, dependency direction?
2. Create new block with new `id` for the extracted concern.
3. Move relevant types/code from original to new block.
4. Update original block's metadata to reflect reduced scope.
5. Update ALL dependents of the original that used moved exports — add new block to `depends_on`, update import paths.
6. Validate and test.

Guidelines:
- Keep original block's `id` unchanged. New block gets a new `id`.
- If splitting creates a circular dependency, rethink the boundary.

### 5. Explore the dependency graph

Before making changes that could cascade:

1. Identify the target block's immediate dependencies and dependents.
2. For contract changes, trace the full transitive dependent tree.
3. Use graph output (if CLI supports it) to visualize relationships.
4. Understand which symbols flow between blocks when available.

## Testing (Chicago School)

1. **Test through public contracts** — call exported functions, not internals.
2. **Use real implementations** — wire up real blocks, no mocking between blocks.
3. **Only mock at architectural boundaries** — external services may use in-memory adapters.
4. **Assert on behavior, not implementation** — verify outputs, not internal method calls.

Write tests when: creating blocks with runtime behavior, modifying implementations, regenerating blocks.
Domain blocks (pure types) generally don't need tests.

## Validation Checklist

After every change, confirm:

1. **Structure** — kebab-case dirs, correct files per kind
2. **Schema** — every `metadata.json` has all 7 fields, valid values
3. **Cross-block** — no duplicate ids, all `depends_on` targets exist, no cycles
4. **Imports** — every import has the target block's id in `depends_on`
5. **Exports** — every symbol in metadata exists in code, every file in the block is declared in metadata

## Operating Rules

- NEVER change a block id.
- Never introduce hidden coupling — if you import from a block, add it to `depends_on`.
- Keep changes local — edit the fewest blocks possible.
- Every source file in a block must be declared in `exports`.
- Prefer type imports for contract references.
- Run validation after every change.
- Run tests after behavioral changes.

## Project Discovery

When starting work on a project using this paradigm:

1. Read `AGENTS.md` (or equivalent) at the project root for CLI commands and skill references.
2. Identify the block CLI command from project scripts/docs (e.g., the validation command, search, inspect, graph, create).
3. Locate the blocks directory.
4. Note the language conventions (file extensions, import syntax, type import syntax, test runner).
5. If `.agents/skills/` exists, read relevant skill files for operation-specific guidance.
