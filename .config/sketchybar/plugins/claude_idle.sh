#!/bin/bash

# Claude Code Idle Sessions Plugin - Display idle/waiting sessions

# Load colors
CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
if [[ -f "$CONFIG_DIR/colors.sh" ]]; then
  source "$CONFIG_DIR/colors.sh"
else
  YELLOW_BRIGHT="0xffffff00"
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

# Collect idle sessions
IDLE_SESSIONS=()

for session_file in "$SESSION_DIR"/*; do
  [[ ! -f "$session_file" ]] && continue

  source "$session_file"
  if [[ "$STATUS" == "w" ]]; then
    IDLE_SESSIONS+=("${DIR_NAME}")
  fi
done

# If no idle sessions, hide the item
if [[ ${#IDLE_SESSIONS[@]} -eq 0 ]]; then
  sketchybar --set "${NAME:-claude_idle}" drawing=off
  exit 0
fi

# Build display text
DISPLAY_TEXT="[IDLE]: $(
  IFS=', '
  echo "${IDLE_SESSIONS[*]}"
)"

# Get the Claude icon
ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")

# Update SketchyBar
sketchybar --set "${NAME:-claude_idle}" \
  icon="$ICON" \
  icon.font="sketchybar-app-font:Regular:13.0" \
  icon.color="$RED_BRIGHT" \
  label="$DISPLAY_TEXT" \
  label.color="$YELLOW_BRIGHT" \
  drawing=on
