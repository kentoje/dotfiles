#!/bin/sh
# Compatibility entry point. Keybindings exec the installed Rust binary directly.
# Build/update: ~/.config/tuios/scripts/install-agent-pane-focus.sh
exec "$HOME/.local/bin/tuios-agent-pane-focus" "$@"
