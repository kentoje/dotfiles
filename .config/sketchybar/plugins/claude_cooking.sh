#!/bin/bash

# Claude Code Cooking Sessions Plugin - Display active/running sessions

# Load colors
CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
if [[ -f "$CONFIG_DIR/colors.sh" ]]; then
  source "$CONFIG_DIR/colors.sh"
else
  GREEN_BRIGHT="0xff90ee90"
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

# Collect cooking sessions
COOKING_SESSIONS=()

for session_file in "$SESSION_DIR"/*; do
  [[ ! -f "$session_file" ]] && continue

  source "$session_file"
  if [[ "$STATUS" == "r" ]]; then
    COOKING_SESSIONS+=("${DIR_NAME}")
  fi
done

# If no cooking sessions, hide the item
if [[ ${#COOKING_SESSIONS[@]} -eq 0 ]]; then
  sketchybar --set "${NAME:-claude_cooking}" drawing=off
  exit 0
fi

# Build display text
DISPLAY_TEXT="[COOKING]: $(
  IFS=', '
  echo "${COOKING_SESSIONS[*]}"
)"

# Get the Claude icon
ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")

# Update SketchyBar
sketchybar --set "${NAME:-claude_cooking}" \
  icon="$ICON" \
  icon.font="sketchybar-app-font:Regular:13.0" \
  icon.color="$RED_BRIGHT" \
  label="$DISPLAY_TEXT" \
  label.color="$GREEN_BRIGHT" \
  drawing=on
