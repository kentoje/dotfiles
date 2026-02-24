---
name: opensrc
description: >
  Fetch source code for npm, PyPI, or crates.io packages and GitHub repos to
  give AI coding agents deeper implementation context beyond types and docs.
  Use when you need to understand how a library works internally, debug
  dependency issues, explore package implementations, or when the user asks
  to fetch, pull, or download source code for a package or repository.
---

# opensrc

CLI tool that fetches package and repository source code so agents can reference
real implementations, not just type signatures.

## When to Use

- Need to understand how a library works internally (not just its interface)
- Debugging issues where types and docs are insufficient
- Exploring implementation patterns in dependencies
- User asks to "fetch source for X", "pull down the code for X", or similar

## Commands

### Fetch packages or repos

```bash
# npm package (auto-detects installed version from lockfile)
opensrc zod

# Specific version
opensrc zod@3.22.0

# Multiple packages
opensrc react react-dom next

# Other registries
opensrc pypi:requests
opensrc crates:serde

# GitHub repos (multiple formats)
opensrc vercel/ai
opensrc github:owner/repo
opensrc https://github.com/colinhacks/zod
opensrc owner/repo@v1.0.0
```

### List fetched sources

```bash
opensrc list
opensrc list --json
```

### Remove sources

```bash
# Remove specific package
opensrc remove zod

# Remove all
opensrc clean

# Remove by registry
opensrc clean --npm
opensrc clean --pypi
opensrc clean --crates
opensrc clean --repos
opensrc clean --packages
```

## Options

| Option          | Description                                              |
| --------------- | -------------------------------------------------------- |
| `--cwd <path>`  | Set working directory                                    |
| `--modify`      | Allow modifying .gitignore, tsconfig.json, AGENTS.md     |
| `--modify=false` | Skip all file modifications                             |

## Output Structure

Sources are stored in an `opensrc/` directory at the project root:

```
opensrc/
  settings.json     # User preferences
  sources.json      # Index of fetched packages/repos
  repos/
    github.com/
      owner/
        repo/       # Cloned source code
```

## Key Behaviors

1. **Version detection** - For npm, auto-detects installed version from
   node_modules, package-lock.json, pnpm-lock.yaml, or yarn.lock
2. **Repository resolution** - Resolves package to its git repo via registry
   API, clones at matching tag
3. **Monorepo support** - Handles packages in monorepos by resolving the
   correct subdirectory
4. **Re-running updates** - Running `opensrc <package>` again updates to match
   the currently installed version

## File Modifications

On first run, opensrc prompts to modify:

- `.gitignore` - adds `opensrc/` to ignore list
- `tsconfig.json` - excludes `opensrc/` from compilation
- `AGENTS.md` - adds a section pointing agents to fetched source code

Use `--modify` to auto-accept or `--modify=false` to skip.

## Workflow

1. Identify the package or repo the user needs context on
2. Run `opensrc <package>` to fetch the source
3. Read the relevant source files from the `opensrc/` directory
4. Use the implementation details to inform your work
