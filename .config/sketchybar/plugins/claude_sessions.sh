#!/bin/bash

CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
[[ -f "$CONFIG_DIR/colors.sh" ]] && source "$CONFIG_DIR/colors.sh"

SESSION_DIR="/tmp/claude_sessions"
mkdir -p "$SESSION_DIR"

# Clean up stale sessions
for f in "$SESSION_DIR"/*; do
  [[ -f "$f" ]] && ! kill -0 "$(basename "$f")" 2>/dev/null && rm -f "$f"
done

# Collect sessions by status
IDLE_SESSIONS=()
COOKING_SESSIONS=()
NOTIFY_SESSIONS=()

for f in "$SESSION_DIR"/*; do
  [[ -f "$f" ]] || continue
  source "$f"
  case "$STATUS" in
  "w") IDLE_SESSIONS+=("$DIR_NAME") ;;
  "r") COOKING_SESSIONS+=("$DIR_NAME") ;;
  "n") NOTIFY_SESSIONS+=("$DIR_NAME") ;;
  esac
done

ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")

update_item() {
  local item="$1" prefix="$2" color="$3" sessions_ref="$4[@]"
  local sessions=("${!sessions_ref}")

  if [[ ${#sessions[@]} -eq 0 ]]; then
    sketchybar --set "$item" drawing=off
  else
    local display_text="[$prefix]: $(
      IFS=', '
      echo "${sessions[*]}"
    )"
    sketchybar --set "$item" \
      icon="$ICON" \
      icon.font="sketchybar-app-font:Regular:13.0" \
      icon.color="${RED_BRIGHT:-0xffff0000}" \
      label="$display_text" \
      label.color="$color" \
      drawing=on
  fi
}

case "${NAME}" in
*idle*) update_item "${NAME:-claude_idle}" "IDLE" "${YELLOW_BRIGHT:-0xffffff00}" "IDLE_SESSIONS" ;;
*cooking*) update_item "${NAME:-claude_cooking}" "COOKING" "${GREEN_BRIGHT:-0xff90ee90}" "COOKING_SESSIONS" ;;
*notify*) update_item "${NAME:-claude_notify}" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "NOTIFY_SESSIONS" ;;
*)
  update_item "claude_idle" "IDLE" "${YELLOW_BRIGHT:-0xffffff00}" "IDLE_SESSIONS"
  update_item "claude_cooking" "COOKING" "${GREEN_BRIGHT:-0xff90ee90}" "COOKING_SESSIONS"
  update_item "claude_notify" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "NOTIFY_SESSIONS"
  ;;
esac
