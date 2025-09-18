---
description: "Creates well-formatted commits with conventional commit messages and emoji"
allowed-tools:
  [
    "Bash(git add:*)",
    "Bash(git status:*)",
    "Bash(git commit:*)",
    "Bash(git diff:*)",
    "Bash(git log:*)",
  ]
---

# Claude Command: Commit

Creates well-formatted commits with conventional commit messages.

## Usage

```
/commit
```

## Process

1. Check staged files, commit only staged files if any exist
2. Analyze diff for multiple logical changes
3. Suggest splitting if needed

## Commit Format

`<type>[optional scope]: <description>`

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `ci`: Ci update
- `docs`: Documentation
- `style`: UI styling
- `refactor`: Code restructuring
- `perf`: Performance
- `test`: Tests
- `chore`: Build/tools

**Rules:**

- Imperative mood ("add" not "added")
- First line <72 chars
- Atomic commits (single purpose)
- Split unrelated changes
- Never include Claude code references like

```
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Split Criteria

Different concerns | Mixed types | File patterns | Large changes

## Options

`-n`: Skip Husky hooks

## Notes

- Only commit staged files if any exist
- Analyze diff for splitting suggestions
