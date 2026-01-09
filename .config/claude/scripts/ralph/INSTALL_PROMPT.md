# Ralph Installation Prompt

Use this prompt to instruct an LLM to install Ralph on a new machine.

---

## Prompt

```
I want you to install the Ralph autonomous agent system on my machine. Ralph is a tool that runs Claude Code in a loop to implement PRD stories autonomously.

Before we start, I need to know:

1. Where should Ralph store its scripts and project data?
   Example: ~/.config/claude/scripts/ralph/

2. Where are your Claude Code skills located?
   Example: ~/.config/claude/skills/

3. Which shell do you use?
   - fish
   - bash
   - zsh

Based on my answers, please:

1. Create the directory structure for Ralph
2. Copy the core files (ralph.sh, prompt.md) to my Ralph directory
3. Copy the skills from the `skills/` directory to my Claude skills location
4. Create shell utilities for my shell (function or alias)

## What to Copy

### From this repository:

```
ralph/
├── ralph.sh              # Copy to: <ralph-dir>/ralph.sh
├── prompt.md             # Copy to: <ralph-dir>/prompt.md
└── skills/
    ├── prd/SKILL.md      # Copy to: <skills-dir>/prd/SKILL.md
    └── ralph/SKILL.md    # Copy to: <skills-dir>/ralph/SKILL.md
```

### Create these directories:
- `<ralph-dir>/projects/` - For per-project data

### Shell Utility Commands to Create
- `cl-ralph init` - Initialize Ralph for current project
- `cl-ralph run [n]` - Run the autonomous loop
- `cl-ralph status` - Show PRD progress
- `cl-ralph prd` - Launch Claude for PRD creation
- `cl-ralph archive` - Archive current run
- `cl-ralph list` - List all projects
- `cl-ralph clean` - Remove project data

### Project ID Convention
Projects are identified by their absolute path, converted to lowercase with slashes replaced by dashes:
`/Users/me/code/myapp` → `users-me-code-myapp`

### Critical Path Handling
The skills must:
- Run `echo $HOME` to get actual home directory (never assume /Users/username)
- Run `pwd | sed 's|^/||' | tr '/' '-' | tr '[:upper:]' '[:lower:]'` for project ID
- Use full expanded paths when writing files

Update the skills after copying to use my actual paths.

## After Installation

Verify with:
1. `cd /path/to/any/project`
2. `cl-ralph init`
3. `cl-ralph status`
```

---

## Shell-Specific Prompts

### For Fish Users

```
Create a fish function at ~/.config/fish/functions/cl-ralph.fish with subcommands: init, run, status, prd, archive, list, clean.

Include helper functions:
- __cl_ralph_project_id - converts pwd to project ID
- __cl_ralph_project_dir - returns full path to project data directory

Set RALPH_HOME to point to my Ralph installation directory.
```

### For Bash Users

```
Create a bash script at ~/.local/bin/cl-ralph (make it executable) with subcommands: init, run, status, prd, archive, list, clean.

The script should:
- Use $HOME for paths
- Define RALPH_HOME pointing to my Ralph installation
- Support: cl-ralph <command> [args]
```

### For Zsh Users

```
Create a zsh function in ~/.zshrc or ~/.zfunc/cl-ralph with subcommands: init, run, status, prd, archive, list, clean.

The function should:
- Use $HOME for paths
- Define RALPH_HOME pointing to my Ralph installation
- Support: cl-ralph <command> [args]
```
