# fe-setup-claude

Interactive setup script that installs Claude Code tooling on a fresh macOS machine.

## Directory layout

```
├── setup.sh                    # Main entry point — runs all sections interactively
├── lib/utils.sh                # Shared helpers: prompts, colors, install_skill, register_mcp
├── test.sh                     # Smoke tests (run in Docker or locally)
├── Dockerfile                  # Homebrew-based container for testing
├── skills/                     # Skill templates (copied to ~/.claude/skills/)
│   └── <skill-name>/SKILL.md
└── mcp-servers/                # MCP server templates (copied to ~/.claude/mcp-servers/)
    └── <server-name>/
        ├── server.ts
        ├── package.json
        └── tools/
```

## Adding a new tool

Every tool follows the same pattern: **install binary → copy config → register with Claude → add tests**.

### 1. CLI tool (like agent-browser)

Add a new section in `setup.sh` between the last tool and the Summary:

```bash
# ─── N. my-tool ──────────────────────────────────────────────────────────────

header "my-tool"

if command -v my-tool &>/dev/null; then
  ok "my-tool $(my-tool --version 2>/dev/null) already installed"
  if confirm "Upgrade to latest version?"; then
    bun install -g --trust my-tool
    ok "my-tool $(my-tool --version 2>/dev/null)"
  fi
else
  info "Installing my-tool..."
  bun install -g --trust my-tool
  ok "my-tool $(my-tool --version 2>/dev/null) installed"
fi
```

Then update the Summary section to include it.

### 2. MCP server (like aircall-personal-tools)

**a) Create the template** in `mcp-servers/<name>/`:

```
mcp-servers/my-server/
├── server.ts       # MCP server entry point (uses @modelcontextprotocol/sdk)
├── package.json    # deps: @modelcontextprotocol/sdk, zod
└── tools/
    └── my-tool.ts  # Tool implementations
```

**Never hardcode credentials or user-specific values into source files.** The MCP server code should read them from `Bun.env` (or `process.env`) at runtime. The setup script passes them to `claude mcp add -e` so Claude Code injects them when launching the server.

**b) Add the setup section** in `setup.sh`:

```bash
header "my-server MCP"

if confirm "Set up my-server MCP?"; then
  MY_SERVER_DIR="${MCP_SERVERS_DIR}/my-server"

  # Prompt for user-specific values
  prompt_input "Some config value" MY_VALUE

  # Copy files (asks before overwrite, installs deps automatically)
  install_mcp_files "my-server" "${SCRIPT_DIR}/mcp-servers/my-server"

  # Register (asks before override if already registered)
  register_mcp my-server -s user \
    -e "MY_VALUE=${MY_VALUE}" \
    -- bun run "${MCP_SERVERS_DIR}/my-server/server.ts" || true
fi
```

**c) For secrets**, use `read_secret` (masked input) and pass via `-e` on `register_mcp`:

```bash
read_secret "API token" MY_TOKEN
register_mcp my-server -s user -e "MY_TOKEN=${MY_TOKEN}" -- bun run "${MY_SERVER_DIR}/server.ts"
```

### 3. Skill (like agent-browser)

**a) Create the skill template** in `skills/<name>/SKILL.md` following the Claude Code skill format:

```markdown
---
name: my-skill
description: >
  When to trigger this skill.
allowed-tools: Bash(my-tool:*)
---

# My Skill

Instructions for Claude on how to use this tool.
```

Add `references/` or `templates/` subdirs if the skill needs them.

**b) Install it** from `setup.sh` with one line:

```bash
install_skill "my-skill" "${SCRIPT_DIR}/skills/my-skill"
```

### 4. Tests

Add a `check` line to `test.sh` for each new component:

```bash
# Binary
check "my-tool is installed" command -v my-tool

# Skill template
check "skill: my-skill template exists" test -f "${SCRIPT_DIR}/skills/my-skill/SKILL.md"

# MCP template (verify no hardcoded values)
check "mcp: my-server has placeholder" grep -q "__MY_VALUE__" "${SCRIPT_DIR}/mcp-servers/my-server/tools/my-tool.ts"
```

### 5. Dockerfile

If the new tool needs system dependencies or a special install step, add it to the Dockerfile before the `COPY` layer so it caches independently.

## Conventions

- **Helpers** — use `lib/utils.sh` functions: `header`, `ok`, `info`, `warn`, `fail`, `confirm`, `prompt_input`, `read_secret`, `install_skill`, `install_mcp_files`, `register_mcp`
- **No hardcoded personal data** — MCP server code reads from `Bun.env` at runtime; setup passes values via `claude mcp add -e`
- **Never use sed to bake credentials into source files** — credentials live in Claude's MCP config, not in code
- **Secrets** — always use `read_secret` (masked), never `prompt_input`
- **MCP scope** — ask the user if the tool should be `-s user` (global) or `-s project` (scoped)
- **Idempotent** — guard installs with `command -v` checks and `[[ ! -d node_modules ]]`
- **Bash 3.2+** — no namerefs (`local -n`), no associative arrays, no `mapfile`
- **Bun** — use `bun install -g --trust` for CLI tools that have postinstall scripts
- **Testing** — run `docker build -t fe-setup-claude . && docker run --rm fe-setup-claude ./test.sh` to validate
