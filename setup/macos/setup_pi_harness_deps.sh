#!/bin/bash

# Installs the pi custom harness node dependencies (effect, @effect/platform-bun, ...).
# Without them pi cannot load the mr-guard extension and dies with:
#   Failed to load extension ".pi-custom-harness/extensions/mr-guard/index.ts":
#   Cannot find module 'effect'
# The lockfile is committed but node_modules is gitignored, so every fresh clone needs this.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
harness_dir="$repo_root/.pi-custom-harness"

if [ ! -f "$harness_dir/package.json" ]; then
  echo "pi harness deps: no package.json in $harness_dir - the pih abbr cannot work from this clone" >&2
  exit 1
fi

install_harness_deps() {
  # setup.sh runs under sudo, where PATH loses the nix profile that provides pnpm.
  # A login shell as the invoking user restores PATH and keeps node_modules user-owned.
  if [ -n "${SUDO_USER:-}" ]; then
    sudo -H -u "$SUDO_USER" -- bash -lc "pnpm --dir '$harness_dir' install --frozen-lockfile"
  else
    pnpm --dir "$harness_dir" install --frozen-lockfile
  fi
}

if ! install_harness_deps; then
  echo "pi harness deps: install failed - the pih abbr will not boot until you run:" >&2
  echo "  pnpm --dir $harness_dir install --frozen-lockfile" >&2
  exit 1
fi
