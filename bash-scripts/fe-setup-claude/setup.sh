#!/usr/bin/env bash
set -euo pipefail

# ─── FE Setup for Claude Code ───────────────────────────────────────────────
# Installs and configures:
#   1. agent-browser        — Browser automation CLI
#   2. aircall-personal-tools — MCP server for Aircall staging auth
#   3. agentation-mcp       — MCP server for visual feedback annotations
#   4. Skills               — agent-browser, agent-browser-aircall-local,
#                             agentation-self-driving
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
MCP_SERVERS_DIR="${CLAUDE_DIR}/mcp-servers"

source "${SCRIPT_DIR}/lib/utils.sh"

# ─── Preflight ───────────────────────────────────────────────────────────────

header "Preflight checks"

if command -v bun &>/dev/null; then
  ok "bun $(bun --version)"
else
  warn "bun is not installed."
  if confirm "Install bun now?"; then
    info "Installing bun..."
    curl -fsSL https://bun.sh/install | bash
    export PATH="${HOME}/.bun/bin:${PATH}"
    if command -v bun &>/dev/null; then
      ok "bun $(bun --version) installed"
    else
      fail "bun installation failed. Install manually: https://bun.sh"
      exit 1
    fi
  else
    fail "bun is required. Install it first: https://bun.sh"
    exit 1
  fi
fi

if command -v claude &>/dev/null; then
  ok "Claude Code $(claude --version 2>/dev/null | head -1)"
else
  warn "Claude Code CLI not found."
  if confirm "Install Claude Code now?"; then
    info "Installing Claude Code..."
    bun install -g @anthropic-ai/claude-code
    if command -v claude &>/dev/null; then
      ok "Claude Code installed: $(claude --version 2>/dev/null | head -1)"
    else
      fail "Claude Code installation failed. Install manually: https://docs.anthropic.com/en/docs/claude-code"
      exit 1
    fi
  else
    warn "Skipping Claude Code install. Some features may not work."
  fi
fi

mkdir -p "${SKILLS_DIR}" "${MCP_SERVERS_DIR}"

# ─── 1. agent-browser ───────────────────────────────────────────────────────

header "agent-browser"

if command -v agent-browser &>/dev/null; then
  ok "agent-browser $(agent-browser --version 2>/dev/null) already installed"
  if ! confirm "Upgrade to latest version?"; then
    info "Keeping current version"
  else
    bun install -g --trust agent-browser
    ok "agent-browser $(agent-browser --version 2>/dev/null)"
  fi
else
  info "Installing agent-browser..."
  bun install -g --trust agent-browser
  ok "agent-browser $(agent-browser --version 2>/dev/null) installed"
fi

if confirm "Run 'agent-browser install' to download Chrome for Testing?"; then
  info "Downloading browser..."
  if agent-browser install 2>&1; then
    ok "Browser binary ready"
  else
    warn "Chrome for Testing download failed (common on ARM64 Linux)."
    info "Install chromium from your package manager and use:"
    info "  agent-browser --executable-path /usr/bin/chromium"
  fi
fi

install_skill "agent-browser" "${SCRIPT_DIR}/skills/agent-browser"

# ─── 2. Aircall MCP Server ──────────────────────────────────────────────────

header "Aircall Personal Tools MCP"

if confirm "Set up the Aircall staging auth MCP server?"; then
  AIRCALL_MCP_DIR="${MCP_SERVERS_DIR}/aircall-personal-tools"
  AIRCALL_ALREADY_SET_UP=false

  # Check for existing setup before asking for credentials
  if [[ -f "${AIRCALL_MCP_DIR}/server.ts" ]] && mcp_is_registered "aircall-personal-tools"; then
    warn "Aircall MCP is already fully configured."
    if ! confirm "Reconfigure it?"; then
      info "Keeping existing Aircall MCP setup"
      install_skill "agent-browser-aircall-local" "${SCRIPT_DIR}/skills/agent-browser-aircall-local"
      AIRCALL_ALREADY_SET_UP=true
    fi
  fi

  if [[ "${AIRCALL_ALREADY_SET_UP}" == false ]]; then
    echo ""
    info "This MCP server authenticates against Aircall staging."
    info "It reads AIRCALL_EMAIL and AIRCALL_PASSWORD from env vars at runtime."
    echo ""

    prompt_input "Aircall staging email" AIRCALL_EMAIL
    if [[ -z "${AIRCALL_EMAIL}" ]]; then
      fail "Email cannot be empty"
      exit 1
    fi

    read_secret "Aircall staging password" AIRCALL_PASSWORD
    if [[ -z "${AIRCALL_PASSWORD}" ]]; then
      fail "Password cannot be empty"
      exit 1
    fi
    ok "Credentials captured"

    # Persist credentials to ~/.zshenv so they survive across shell sessions
    persist_env "AIRCALL_EMAIL" "${AIRCALL_EMAIL}"
    persist_env "AIRCALL_PASSWORD" "${AIRCALL_PASSWORD}"
    ok "Credentials persisted to ~/.zshenv"

    # Copy MCP server files (asks before overwrite)
    install_mcp_files "aircall-personal-tools" "${SCRIPT_DIR}/mcp-servers/aircall-personal-tools"

    # Register with Claude Code — credentials passed as env vars (asks before override)
    register_mcp aircall-personal-tools -s user \
      -e "AIRCALL_EMAIL=${AIRCALL_EMAIL}" \
      -e "AIRCALL_PASSWORD=${AIRCALL_PASSWORD}" \
      -- bun run "${AIRCALL_MCP_DIR}/server.ts" || true

    install_skill "agent-browser-aircall-local" "${SCRIPT_DIR}/skills/agent-browser-aircall-local"
    ok "Aircall MCP server configured"
  fi
else
  info "Skipping Aircall MCP setup"
fi

# ─── 3. agentation-mcp ──────────────────────────────────────────────────────

header "agentation-mcp"

if confirm "Set up agentation (visual feedback annotations)?"; then
  echo ""
  info "agentation-mcp can be registered globally or for a specific project."
  echo ""
  echo -e "  ${BOLD}1)${NC} Global — available in all projects"
  echo -e "  ${BOLD}2)${NC} Project — scoped to a specific directory"
  echo ""

  prompt_input "Choose scope [1/2]" AGENTATION_SCOPE
  AGENTATION_SCOPE="${AGENTATION_SCOPE:-1}"

  case "${AGENTATION_SCOPE}" in
    1)
      info "Registering agentation-mcp globally..."
      register_mcp agentation -s user -- npx agentation-mcp server || true
      ;;
    2)
      prompt_input "Project directory (absolute path)" PROJECT_DIR
      if [[ -d "${PROJECT_DIR}" ]]; then
        info "Registering agentation-mcp for ${PROJECT_DIR}..."
        (cd "${PROJECT_DIR}" && register_mcp agentation -s project -- npx agentation-mcp server) || true
      else
        fail "Directory does not exist: ${PROJECT_DIR}"
      fi
      ;;
    *)
      warn "Invalid choice. Skipping agentation-mcp registration."
      ;;
  esac

  install_skill "agentation-self-driving" "${SCRIPT_DIR}/skills/agentation-self-driving"
  ok "agentation setup complete"
else
  info "Skipping agentation setup"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

header "Setup complete"

echo ""
echo -e "Installed tools:"
command -v agent-browser &>/dev/null && ok "agent-browser $(agent-browser --version 2>/dev/null)"
[[ -d "${MCP_SERVERS_DIR}/aircall-personal-tools" ]] && ok "aircall-personal-tools MCP"
[[ -f "${CLAUDE_DIR}/settings.json" ]] && grep -q '"agentation"' "${CLAUDE_DIR}/settings.json" 2>/dev/null && ok "agentation-mcp"

echo ""
echo -e "Installed skills:"
for skill in agent-browser agent-browser-aircall-local agentation-self-driving; do
  [[ -f "${SKILLS_DIR}/${skill}/SKILL.md" ]] && ok "${skill}"
done

echo ""
info "Restart Claude Code for changes to take effect."
