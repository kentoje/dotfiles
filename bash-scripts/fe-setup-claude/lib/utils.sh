#!/usr/bin/env bash
# Shared helpers for fe-setup-claude

# Colors (safe to source standalone)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

header() { echo ""; echo -e "${BOLD}── $1 ──${NC}"; echo ""; }
ok()     { echo -e "  ${GREEN}✓${NC} $1"; }
info()   { echo -e "  ${BLUE}ℹ${NC} $1"; }
warn()   { echo -e "  ${YELLOW}!${NC} $1"; }
fail()   { echo -e "  ${RED}✗${NC} $1"; }

confirm() {
  local answer
  read -rp "$(echo -e "  ${BLUE}?${NC}") $1 [Y/n] " answer
  [[ -z "${answer}" || "${answer}" =~ ^[Yy] ]]
}

# Prompt for visible input, stores in named variable (bash 3.2+ compatible)
prompt_input() {
  local prompt="$1"
  read -rp "$(echo -e "  ${BLUE}?${NC}") ${prompt}: " "$2"
}

# Prompt for secret input (masked), stores in named variable (bash 3.2+ compatible)
read_secret() {
  local prompt="$1"
  echo -ne "  ${BLUE}?${NC} ${prompt}: "
  IFS= read -rs "$2"
  echo ""
}

# Write an export to ~/.zshenv. Adds if missing, updates if value changed, skips if identical.
persist_env() {
  local var_name="$1"
  local var_value="$2"
  local zshenv="${HOME}/.zshenv"
  local export_line="export ${var_name}=\"${var_value}\""

  touch "${zshenv}"

  if grep -q "^export ${var_name}=" "${zshenv}" 2>/dev/null; then
    # Already present — replace with new value (handles reconfigure)
    local tmp
    tmp=$(mktemp)
    sed "s|^export ${var_name}=.*|${export_line}|" "${zshenv}" > "${tmp}" && mv "${tmp}" "${zshenv}"
  else
    # Not present — append
    echo "${export_line}" >> "${zshenv}"
  fi
}

install_skill() {
  local skill_name="$1"
  local source_dir="$2"
  local target_dir="${SKILLS_DIR}/${skill_name}"

  if [[ -d "${target_dir}" ]]; then
    if confirm "Skill '${skill_name}' already exists. Overwrite?"; then
      rm -rf "${target_dir}"
    else
      info "Keeping existing ${skill_name} skill"
      return 0
    fi
  fi

  cp -r "${source_dir}" "${target_dir}"
  ok "Skill '${skill_name}' installed → ${target_dir}"
}

# Check if an MCP server is already registered with Claude Code
mcp_is_registered() {
  local name="$1"
  command -v claude &>/dev/null \
    && claude mcp list 2>/dev/null | grep -q "^${name}:" 2>/dev/null
}

# Register an MCP server with Claude Code, showing errors instead of swallowing them.
# Skips if already registered unless the caller confirms override.
register_mcp() {
  local name="$1"
  if ! command -v claude &>/dev/null; then
    warn "Claude Code not found — register manually: claude mcp add $*"
    return 1
  fi
  if mcp_is_registered "${name}"; then
    warn "MCP server '${name}' is already registered."
    if confirm "Override existing registration?"; then
      claude mcp remove "${name}" 2>/dev/null || true
    else
      info "Keeping existing '${name}' registration"
      return 0
    fi
  fi
  local output
  if output=$(claude mcp add "$@" 2>&1); then
    ok "MCP server '${name}' registered"
  else
    warn "claude mcp add failed: ${output}"
    return 1
  fi
}

# Copy MCP server files to ~/.claude/mcp-servers/<name>/, asking before overwrite.
install_mcp_files() {
  local name="$1"
  local source_dir="$2"
  local target_dir="${MCP_SERVERS_DIR}/${name}"

  if [[ -d "${target_dir}" && -f "${target_dir}/server.ts" ]]; then
    warn "MCP server files for '${name}' already exist at ${target_dir}"
    if confirm "Overwrite existing files?"; then
      rm -rf "${target_dir}"
    else
      info "Keeping existing files for '${name}'"
      return 0
    fi
  fi

  mkdir -p "${target_dir}"
  cp -r "${source_dir}/." "${target_dir}/"
  ok "MCP server files installed → ${target_dir}"

  # Install deps if needed
  if [[ -f "${target_dir}/package.json" && ! -d "${target_dir}/node_modules" ]]; then
    info "Installing MCP server dependencies..."
    (cd "${target_dir}" && bun install)
  fi
}
