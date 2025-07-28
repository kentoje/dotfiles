#!/bin/bash

# Claude Code Notify Sessions Plugin - Display notification sessions

# Load colors
CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
if [[ -f "$CONFIG_DIR/colors.sh" ]]; then
  source "$CONFIG_DIR/colors.sh"
else
  MAUVE_BRIGHT="0xff89B3B6"
  RED_BRIGHT="0xffff0000"
fi

# Session directory
SESSION_DIR="/tmp/claude_sessions"

# Create session directory if needed
mkdir -p "$SESSION_DIR"

# Clean up stale sessions (PIDs that no longer exist)
for session_file in "$SESSION_DIR"/*; do
  [[ ! -f "$session_file" ]] && continue

  pid=$(basename "$session_file")
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$session_file"
  fi
done

# Collect notify sessions
NOTIFY_SESSIONS=()

for session_file in "$SESSION_DIR"/*; do
  [[ ! -f "$session_file" ]] && continue

  source "$session_file"
  if [[ "$STATUS" == "n" ]]; then
    NOTIFY_SESSIONS+=("${DIR_NAME}")
  fi
done

# If no notify sessions, hide the item
if [[ ${#NOTIFY_SESSIONS[@]} -eq 0 ]]; then
  sketchybar --set "${NAME:-claude_notify}" drawing=off
  exit 0
fi

# Build display text
DISPLAY_TEXT="[!]: $(
  IFS=', '
  echo "${NOTIFY_SESSIONS[*]}"
)"

# Get the Claude icon
ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")

# Update SketchyBar
sketchybar --set "${NAME:-claude_notify}" \
  icon="$ICON" \
  icon.font="sketchybar-app-font:Regular:13.0" \
  icon.color="$RED_BRIGHT" \
  label="$DISPLAY_TEXT" \
  label.color="$PURPLE_BRIGHT" \
  drawing=on
