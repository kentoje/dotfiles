#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/utils.sh"

PASS=0
FAIL=0

check() {
  local desc="$1"
  shift
  if "$@" &>/dev/null; then
    ok "${desc}"
    PASS=$((PASS + 1))
  else
    fail "${desc}"
    FAIL=$((FAIL + 1))
  fi
}

# ─── Smoke Tests ─────────────────────────────────────────────────────────────

header "Smoke Tests"

check "bun is installed" command -v bun
check "claude is installed" command -v claude
check "agent-browser is installed" command -v agent-browser
check "agent-browser version >= 0.20" bash -c '
  v=$(agent-browser --version 2>/dev/null | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
  IFS=. read -r maj min _ <<< "$v"
  (( maj > 0 || (maj == 0 && min >= 20) ))
'
check "bunx agentation-mcp is reachable" bash -c 'bunx --bun agentation-mcp --help 2>&1 | head -1'
check "setup.sh exists and is executable" test -x "${SCRIPT_DIR}/setup.sh"
check "skill: agent-browser template exists" test -f "${SCRIPT_DIR}/skills/agent-browser/SKILL.md"
check "skill: aircall-local template exists" test -f "${SCRIPT_DIR}/skills/agent-browser-aircall-local/SKILL.md"
check "skill: agentation template exists" test -f "${SCRIPT_DIR}/skills/agentation-self-driving/SKILL.md"
check "mcp: aircall server.ts template exists" test -f "${SCRIPT_DIR}/mcp-servers/aircall-personal-tools/server.ts"
check "mcp: persist-browser-auth has no hardcoded email" bash -c "! grep -q 'kento' '${SCRIPT_DIR}/mcp-servers/aircall-personal-tools/tools/persist-browser-auth.ts'"
check "mcp: persist-browser-auth reads email from env" grep -q 'Bun.env.AIRCALL_EMAIL' "${SCRIPT_DIR}/mcp-servers/aircall-personal-tools/tools/persist-browser-auth.ts"
check "mcp: persist-browser-auth reads password from env" grep -q 'Bun.env.AIRCALL_PASSWORD' "${SCRIPT_DIR}/mcp-servers/aircall-personal-tools/tools/persist-browser-auth.ts"
check "mcp: no sed templating in setup.sh" bash -c "! grep -q '__AIRCALL_' '${SCRIPT_DIR}/setup.sh'"

# ─── Conflict / Idempotency Tests ───────────────────────────────────────────

header "Conflict Tests"

CLAUDE_DIR="${HOME}/.claude"
SKILLS_DIR="${CLAUDE_DIR}/skills"
MCP_SERVERS_DIR="${CLAUDE_DIR}/mcp-servers"

# Test: install_skill detects existing skill and asks
check "install_skill guards existing skill" bash -c '
  source "'"${SCRIPT_DIR}"'/lib/utils.sh"
  export SKILLS_DIR='"${SKILLS_DIR}"'
  mkdir -p "${SKILLS_DIR}/test-skill"
  echo "existing" > "${SKILLS_DIR}/test-skill/SKILL.md"
  # Answer "n" to overwrite prompt — should keep existing file
  echo "n" | install_skill "test-skill" "'"${SCRIPT_DIR}"'/skills/agent-browser" 2>/dev/null
  grep -q "existing" "${SKILLS_DIR}/test-skill/SKILL.md"
'

# Test: install_mcp_files detects existing files and asks
check "install_mcp_files guards existing files" bash -c '
  source "'"${SCRIPT_DIR}"'/lib/utils.sh"
  export MCP_SERVERS_DIR='"${MCP_SERVERS_DIR}"'
  mkdir -p "${MCP_SERVERS_DIR}/test-mcp"
  echo "existing" > "${MCP_SERVERS_DIR}/test-mcp/server.ts"
  # Answer "n" to overwrite prompt — should keep existing file
  echo "n" | install_mcp_files "test-mcp" "'"${SCRIPT_DIR}"'/mcp-servers/aircall-personal-tools" 2>/dev/null
  grep -q "existing" "${MCP_SERVERS_DIR}/test-mcp/server.ts"
'

# Test: install_skill overwrites when confirmed
check "install_skill overwrites on confirm" bash -c '
  source "'"${SCRIPT_DIR}"'/lib/utils.sh"
  export SKILLS_DIR='"${SKILLS_DIR}"'
  mkdir -p "${SKILLS_DIR}/test-skill2"
  echo "MARKER_OLD_CONTENT" > "${SKILLS_DIR}/test-skill2/SKILL.md"
  # Answer "y" to overwrite prompt — should replace
  echo "y" | install_skill "test-skill2" "'"${SCRIPT_DIR}"'/skills/agent-browser" 2>/dev/null
  ! grep -q "MARKER_OLD_CONTENT" "${SKILLS_DIR}/test-skill2/SKILL.md"
'

# Test: install_mcp_files overwrites when confirmed
check "install_mcp_files overwrites on confirm" bash -c '
  source "'"${SCRIPT_DIR}"'/lib/utils.sh"
  export MCP_SERVERS_DIR='"${MCP_SERVERS_DIR}"'
  mkdir -p "${MCP_SERVERS_DIR}/test-mcp2"
  echo "MARKER_OLD_CONTENT" > "${MCP_SERVERS_DIR}/test-mcp2/server.ts"
  # Answer "y" to overwrite prompt — should replace
  echo "y" | install_mcp_files "test-mcp2" "'"${SCRIPT_DIR}"'/mcp-servers/aircall-personal-tools" 2>/dev/null
  ! grep -q "MARKER_OLD_CONTENT" "${MCP_SERVERS_DIR}/test-mcp2/server.ts"
'

# Cleanup test artifacts
rm -rf "${SKILLS_DIR}/test-skill" "${SKILLS_DIR}/test-skill2" \
       "${MCP_SERVERS_DIR}/test-mcp" "${MCP_SERVERS_DIR}/test-mcp2" 2>/dev/null

echo ""
echo "── Results: ${PASS} passed, ${FAIL} failed ──"
[[ ${FAIL} -eq 0 ]] && exit 0 || exit 1
