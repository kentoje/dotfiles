# Ralph - Autonomous AI Agent Loop

Ralph is an autonomous agent system that runs Claude Code in a loop to implement PRD (Product Requirements Document) stories one at a time.

## How It Works

1. You write a PRD describing your feature
2. Ralph converts it to a structured `prd.json` with small, implementable stories
3. Ralph runs Claude Code repeatedly, each iteration:
   - Picks the next incomplete story
   - Implements it
   - Runs quality checks
   - Commits if passing
   - Moves to the next story
4. Loop ends when all stories are complete

**Key Innovation:** Each iteration gets fresh context, preventing the AI from getting lost in large implementations. Memory persists via git history, progress.txt, and prd.json.

## Repository Structure

```
ralph/
├── ralph.sh              # Main loop script
├── prompt.md             # Instructions for each Claude iteration
├── skills/               # Claude Code skills (copy to your skills dir)
│   ├── prd/SKILL.md      # PRD generator skill
│   └── ralph/SKILL.md    # PRD-to-JSON converter skill
├── INSTALL_PROMPT.md     # Prompt for LLM-assisted installation
├── README.md             # This file
└── .specs/               # Specifications
```

## Installation

### Option 1: LLM-Assisted Installation (Recommended)

Copy the prompt from `INSTALL_PROMPT.md` and paste it into Claude Code. Answer the questions about:
- Where to store Ralph scripts
- Where your Claude Code skills are located
- Which shell you use (fish/bash/zsh)

The LLM will set everything up for you.

### Option 2: Manual Installation

#### 1. Choose Your Directories

```bash
# Example locations - adjust to your preference
RALPH_DIR="$HOME/.config/claude/scripts/ralph"
SKILLS_DIR="$HOME/.config/claude/skills"
```

#### 2. Create Directory Structure

```bash
mkdir -p "$RALPH_DIR/projects"
mkdir -p "$SKILLS_DIR/prd"
mkdir -p "$SKILLS_DIR/ralph"
```

#### 3. Copy Core Files

```bash
# Copy from this repository
cp ralph.sh "$RALPH_DIR/"
cp prompt.md "$RALPH_DIR/"
chmod +x "$RALPH_DIR/ralph.sh"
```

#### 4. Copy Skills

```bash
cp skills/prd/SKILL.md "$SKILLS_DIR/prd/"
cp skills/ralph/SKILL.md "$SKILLS_DIR/ralph/"
```

**Important:** After copying, edit the skills to update paths if your `$RALPH_DIR` differs from the default.

#### 5. Create Shell Function

Create a shell function/script for your shell:

**Fish:** Create `~/.config/fish/functions/cl-ralph.fish`
**Bash:** Create `~/.local/bin/cl-ralph` (add to PATH)
**Zsh:** Add function to `~/.zshrc` or create `~/.zfunc/cl-ralph`

See `INSTALL_PROMPT.md` for shell-specific details, or ask an LLM to generate it.

## Usage

### Workflow

```bash
# 1. Navigate to your project
cd /path/to/your/project

# 2. Initialize Ralph for this project
cl-ralph init

# 3. Create a PRD using the /prd skill
# In Claude Code, run: /prd
# Answer the clarifying questions
# PRD saves to your Ralph projects directory

# 4. Convert PRD to JSON using the /ralph skill
# In Claude Code, run: /ralph
# It auto-detects your project and saves prd.json

# 5. Run the autonomous loop
cl-ralph run        # Default: 10 iterations
cl-ralph run 5      # Or specify max iterations

# 6. Monitor progress
cl-ralph status

# 7. When done with a feature
cl-ralph archive
```

### Commands

| Command | Description |
|---------|-------------|
| `cl-ralph init` | Initialize Ralph for current project |
| `cl-ralph run [n]` | Run loop (default: 10 iterations) |
| `cl-ralph status` | Show PRD progress |
| `cl-ralph prd` | Launch Claude for PRD creation |
| `cl-ralph archive` | Archive current run |
| `cl-ralph list` | List all Ralph projects |
| `cl-ralph clean` | Remove project data |

## Project Data Structure

Ralph stores all data in a global directory, keeping your projects clean:

```
<ralph-dir>/projects/<project-id>/
├── prd.md          # Human-readable PRD
├── prd.json        # Machine-readable PRD with story status
├── progress.txt    # Learnings log
├── .last-branch    # Branch tracking
└── archive/        # Previous PRD runs
```

**Project IDs** are derived from absolute paths:
`/Users/me/code/myapp` → `users-me-code-myapp`

## Writing Good PRDs

### Story Size (Critical)

Each story must be completable in ONE iteration. If a story is too big, Claude runs out of context before finishing.

**Good sizes:**
- Add a database column and migration
- Add a UI component to an existing page
- Update a server action with new logic

**Too big (split these):**
- "Build the entire dashboard"
- "Add authentication"
- "Refactor the API"

**Rule of thumb:** If you can't describe the change in 2-3 sentences, split it.

### Story Ordering

Stories execute in priority order. Dependencies must come first:

1. Database/schema changes
2. Backend logic
3. UI components
4. Dashboard/summary views

### Acceptance Criteria

Must be verifiable, not vague:

- ✅ "Add status column with default 'pending'"
- ✅ "Clicking delete shows confirmation dialog"
- ✅ "Typecheck passes"
- ❌ "Works correctly"
- ❌ "Good UX"

## How Memory Works

Between iterations, Ralph remembers via:
- **Git history** - Every commit is a checkpoint
- **prd.json** - Tracks which stories are complete (`passes: true/false`)
- **progress.txt** - Consolidated learnings and patterns

## Requirements

- Claude Code CLI (`claude`)
- `jq` for JSON processing
- Fish/Bash/Zsh shell

## License

MIT
