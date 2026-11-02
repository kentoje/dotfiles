#!/bin/sh
# Warns that the agent pane focus binary is not installed, in a tuios popup.
# Cmd+e / Cmd+Shift+e fall back to this when ~/.local/bin/tuios-agent-pane-focus
# is missing (a fresh pull or machine that never ran the installer).
# The popup offers to build and install it, then retries the original direction.
set -eu
direction=${1:-next}
installer="$HOME/.config/tuios/scripts/install-agent-pane-focus.sh"
binary="$HOME/.local/bin/tuios-agent-pane-focus"

exec tuios popup --width 76 --height 14 -- sh -c '
installer=$1 binary=$2 direction=$3
printf "\033[1;33mAgent pane focus binary missing\033[0m\n\n"
printf "Cmd+e / Cmd+Shift+e need %s\n" "$binary"
printf "It is built from ~/.config/tuios/agent-pane-focus by:\n  %s\n\n" "$installer"
printf "Build and install it now? [y/N] "
read -r answer
case $answer in
  y|Y|yes)
    if "$installer"; then
      "$binary" "$direction" || { printf "\nFocus failed. Press enter to close."; read -r _; }
    else
      printf "\nInstall failed. Press enter to close."; read -r _
    fi
    ;;
esac
' sh "$installer" "$binary" "$direction"
