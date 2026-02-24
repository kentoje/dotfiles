---
name: refactor-agents-markdown
description: >
  Refactor an AGENTS.md file to follow progressive disclosure principles.
  Use when the user wants to restructure, clean up, or optimize their
  AGENTS.md (or similar agent instruction files) for clarity and
  maintainability. Triggers on: "refactor AGENTS.md", "clean up AGENTS.md",
  "split AGENTS.md", "organize agent instructions", "progressive disclosure",
  "AGENTS.md is too long", "simplify AGENTS.md".
---

# Refactor AGENTS.md

Restructure agent instruction files using progressive disclosure: keep the
root file minimal and link out to focused documents for specific topics.

## When to Use

- The user wants to refactor, reorganize, or clean up their AGENTS.md
- AGENTS.md has grown too large or contains mixed concerns
- Instructions are hard to maintain or contain contradictions

## Workflow

Follow these steps in order. Do NOT skip steps or combine them.

### Step 1: Read the current AGENTS.md

Read the entire file. If there are linked files, read those too.

### Step 2: Find contradictions

Scan for instructions that conflict with each other. Present each
contradiction to the user and ask which version to keep before proceeding.

Examples of contradictions:
- "Always use named exports" vs "Use default exports for pages"
- "Never use `any`" vs "Use `any` for legacy API responses"
- Conflicting naming conventions in different sections

If no contradictions are found, state that clearly and move on.

### Step 3: Flag for deletion

Identify instructions that should be removed entirely. Present these to the
user for approval before deleting. Categories:

**Redundant** - Things the agent already knows without being told:
- "Use descriptive variable names"
- "Follow TypeScript best practices"
- "Write clean, maintainable code"
- "Handle errors appropriately"
- Generic language features the model already understands

**Too vague to be actionable** - Instructions that give no concrete guidance:
- "Keep components small" (how small?)
- "Use proper error handling" (what does proper mean?)
- "Follow the existing patterns" (which patterns?)

**Overly obvious** - Instructions any competent developer would follow:
- "Don't commit secrets"
- "Test your code"
- "Use version control"

Present these as a list and ask the user to confirm which to remove.

### Step 4: Identify root-level essentials

Extract ONLY what belongs in the root AGENTS.md. This should be a small
file. The root file should contain:

- One-sentence project description
- Package manager (only if not npm)
- Non-standard build/typecheck/lint/test commands
- Any instruction that is genuinely relevant to every single task

Everything else goes into linked files.

### Step 5: Group remaining instructions

Organize the surviving instructions into logical categories. Common groups
(use only the ones that apply):

| Group | Example content |
|---|---|
| `typescript.md` | Strict types, import style, naming conventions |
| `testing.md` | Test runner, patterns, coverage requirements |
| `api-design.md` | REST/GraphQL conventions, error formats |
| `git-workflow.md` | Branch naming, commit messages, PR process |
| `components.md` | Component structure, styling approach |
| `architecture.md` | Project structure, module boundaries |
| `database.md` | Schema conventions, migration patterns |
| `auth.md` | Authentication/authorization patterns |

Choose group names that match the project's actual concerns. Don't create
groups with fewer than 3 instructions - merge them into a related group.

### Step 6: Write the files

Create the restructured files:

1. **Root AGENTS.md** - Minimal, with markdown links to each group file:

```markdown
# Project Name

One-sentence description.

## Quick Reference

- Package manager: pnpm
- Build: `pnpm build`
- Test: `pnpm vitest`

## Conventions

Detailed conventions are split by topic:

- [TypeScript](docs/agents/typescript.md)
- [Testing](docs/agents/testing.md)
- [Git Workflow](docs/agents/git-workflow.md)
```

2. **Group files** in a `docs/agents/` directory (or another location if the
   project already has a docs structure). Each file should:
   - Have a clear title
   - Contain only actionable, specific instructions
   - Be self-contained (no dependencies on other group files)

### Step 7: Summary

Present a summary of changes:
- Number of instructions removed (with reasons)
- Number of group files created
- Before/after line count of root AGENTS.md

## Important Rules

- ALWAYS ask the user before deleting any instructions
- ALWAYS ask the user to resolve contradictions - never pick a side yourself
- Prefer fewer, larger group files over many small ones
- If a group file would have fewer than 3 rules, merge it with a related group
- Keep the root AGENTS.md under 30 lines when possible
- Use the project's existing docs directory structure if one exists
