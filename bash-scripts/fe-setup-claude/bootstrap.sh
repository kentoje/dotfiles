#!/usr/bin/env bash
set -euo pipefail

# ─── FE Setup for Claude Code — Bootstrap ────────────────────────────────────
# One-liner install:
#   bash <(curl -fsSL https://raw.githubusercontent.com/kentoje/dotfiles/main/bash-scripts/fe-setup-claude/bootstrap.sh)
# ─────────────────────────────────────────────────────────────────────────────

REPO="https://github.com/kentoje/dotfiles.git"
BRANCH="main"
SETUP_PATH="bash-scripts/fe-setup-claude"

TMPDIR=$(mktemp -d)
trap 'rm -rf "${TMPDIR}"' EXIT

echo ""
echo "  Fetching setup files..."
echo ""

if command -v git &>/dev/null; then
  git clone --depth 1 --branch "${BRANCH}" --filter=blob:none --sparse "${REPO}" "${TMPDIR}/dotfiles" 2>/dev/null
  (cd "${TMPDIR}/dotfiles" && git sparse-checkout set "${SETUP_PATH}" 2>/dev/null)
  exec bash "${TMPDIR}/dotfiles/${SETUP_PATH}/setup.sh"
else
  # Fallback: download tarball if git isn't installed
  curl -fsSL "https://github.com/kentoje/dotfiles/archive/refs/heads/${BRANCH}.tar.gz" \
    | tar -xz -C "${TMPDIR}" --strip-components=1
  exec bash "${TMPDIR}/${SETUP_PATH}/setup.sh"
fi
