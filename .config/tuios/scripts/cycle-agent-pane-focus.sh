#!/bin/sh
# Compatibility entry point. Keybindings exec the installed Rust binary directly.
# Build/update: ~/.config/tuios/scripts/install-agent-pane-focus.sh
b="$HOME/.local/bin/tuios-agent-pane-focus"
[ -x "$b" ] && exec "$b" "$@"
exec "$HOME/.config/tuios/scripts/warn-agent-pane-focus-missing.sh" "${1:-next}"
