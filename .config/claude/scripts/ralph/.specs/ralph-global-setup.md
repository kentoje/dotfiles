# Ralph Global Setup Specification

## Overview

Ralph is an autonomous AI agent loop that repeatedly runs Claude Code to implement PRD (Product Requirements Document) stories one at a time. This global setup allows Ralph to be used across any project without copy-pasting files.

## Architecture

### Directory Structure

```
$HOME/dotfiles/.config/claude/scripts/ralph/
├── ralph.sh              # Main orchestration loop
├── prompt.md             # Instructions for each Claude iteration
├── .specs/               # Specification files
└── projects/             # Per-project data (auto-created)
    └── <project-id>/     # e.g., "volumes-homex-kento-documents-gitlab-myapp"
        ├── prd.md        # PRD markdown (human-readable)
        ├── prd.json      # PRD JSON (machine-readable)
        ├── progress.txt  # Learnings log
        ├── .last-branch  # Branch tracking
        └── archive/      # Previous PRD runs

$HOME/dotfiles/.config/claude/skills/
├── prd/SKILL.md          # PRD generator skill
└── ralph/SKILL.md        # PRD-to-JSON converter skill

$HOME/dotfiles/.config/fish/functions/
└── cl-ralph.fish         # Fish shell function
```

### Project ID Convention

Project IDs are derived from absolute paths:
- Remove leading `/`
- Replace `/` with `-`
- Lowercase everything

Example: `/Volumes/HomeX/kento/Documents/gitlab/myapp` → `volumes-homex-kento-documents-gitlab-myapp`

## Components

### 1. Fish Function (`cl-ralph`)

**Location:** `$HOME/dotfiles/.config/fish/functions/cl-ralph.fish`

| Command | Description |
|---------|-------------|
| `cl-ralph` | Show help |
| `cl-ralph init` | Initialize Ralph for current project |
| `cl-ralph run [n]` | Run Ralph loop (default: 10 iterations) |
| `cl-ralph status` | Show PRD progress |
| `cl-ralph prd` | Launch Claude for PRD creation |
| `cl-ralph archive` | Archive current run (prd.md, prd.json, progress.txt) |
| `cl-ralph list` | List all Ralph projects |
| `cl-ralph clean` | Remove project data |

### 2. Main Loop Script (`ralph.sh`)

**Location:** `$HOME/dotfiles/.config/claude/scripts/ralph/ralph.sh`

- Accepts environment variables: `RALPH_PROJECT_DIR`, `RALPH_CWD`
- Runs Claude Code with `--dangerously-skip-permissions -p`
- Substitutes `{{PROJECT_DIR}}` and `{{WORKING_DIR}}` placeholders in prompt
- Detects completion via `<promise>COMPLETE</promise>` signal
- Archives previous runs when branch changes

### 3. Prompt Template (`prompt.md`)

**Location:** `$HOME/dotfiles/.config/claude/scripts/ralph/prompt.md`

Instructions for each Claude iteration:
1. Read PRD from `{{PROJECT_DIR}}/prd.json`
2. Read progress log from `{{PROJECT_DIR}}/progress.txt`
3. Checkout/create the branch specified in PRD
4. Pick highest priority incomplete story
5. Implement the story
6. Run quality checks
7. Commit if passing
8. Update PRD to mark story as `passes: true`
9. Append learnings to progress.txt
10. Signal `<promise>COMPLETE</promise>` when all stories done

### 4. Skills

#### `/prd` Skill
- Generates PRDs through clarifying questions
- Auto-saves to global Ralph projects directory
- Derives project ID from current working directory

#### `/ralph` Skill
- Converts PRD markdown to prd.json format
- Auto-saves to global Ralph projects directory
- Never asks user for save location

## Workflow

```
1. cd /path/to/project
2. cl-ralph init              # Initialize project
3. /prd                       # Generate PRD (saves prd.md)
4. /ralph                     # Convert to prd.json
5. cl-ralph run               # Start autonomous loop
6. cl-ralph status            # Monitor progress
7. cl-ralph archive           # Archive when done
```

## Key Design Decisions

### Fresh Context Per Iteration
Each iteration spawns a new Claude Code instance with clean context. Memory persists via:
- Git history (commits)
- `prd.json` (task status)
- `progress.txt` (learnings)

### Story Size Constraint
Stories must be small enough for one context window. Rule of thumb: if you can't describe the change in 2-3 sentences, split it.

### Dependency Ordering
Stories execute in priority order:
1. Database/schema changes
2. Backend logic
3. UI components
4. Dashboard/summary views

### Global Project Storage
All Ralph data lives in `ralph/projects/<project-id>/`, keeping actual project directories clean.

### Path Handling
- Never assume `$HOME` equals `/Users/username`
- Always expand paths using `echo $HOME` before writing files
- Use full expanded paths in Write tool calls

## Files Archived

When running `cl-ralph archive`:
- `prd.md` → `archive/YYYY-MM-DD-<branch>/prd.md`
- `prd.json` → `archive/YYYY-MM-DD-<branch>/prd.json`
- `progress.txt` → `archive/YYYY-MM-DD-<branch>/progress.txt`
