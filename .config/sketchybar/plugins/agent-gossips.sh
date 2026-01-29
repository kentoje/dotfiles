#!/bin/bash

# Agent Gossips SketchyBar Plugin
# Reads state from /tmp/agent-gossips/instances.json
# Updates 3 display items: idle, cooking, notify

CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
[[ -f "$CONFIG_DIR/colors.sh" ]] && source "$CONFIG_DIR/colors.sh"

STATE_FILE="/tmp/agent-gossips/instances.json"

# Read state file
if [[ ! -f "$STATE_FILE" ]]; then
  # No state file - hide all items
  sketchybar --set agent_gossips_idle drawing=off \
    --set agent_gossips_cooking drawing=off \
    --set agent_gossips_notify drawing=off
  exit 0
fi

STATE=$(cat "$STATE_FILE" 2>/dev/null)
if [[ -z "$STATE" || "$STATE" == "null" ]]; then
  sketchybar --set agent_gossips_idle drawing=off \
    --set agent_gossips_cooking drawing=off \
    --set agent_gossips_notify drawing=off
  exit 0
fi

# Get icon for display
ICON=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")

# Categorize instances by state
# idle -> IDLE
# running -> COOKING
# waiting_for_permission, waiting_for_answer, retry -> NOTIFY

IDLE_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "idle") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)
COOKING_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "running") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)
NOTIFY_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "waiting_for_permission" or .state == "waiting_for_answer" or .state == "retry") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)

# Count instances per category
IDLE_COUNT=$(echo "$STATE" | jq '[.instances[] | select(.state == "idle")] | length')
COOKING_COUNT=$(echo "$STATE" | jq '[.instances[] | select(.state == "running")] | length')
NOTIFY_COUNT=$(echo "$STATE" | jq '[.instances[] | select(.state == "waiting_for_permission" or .state == "waiting_for_answer" or .state == "retry")] | length')

# Update function
update_item() {
  local item="$1"
  local prefix="$2"
  local color="$3"
  local dirs="$4"
  local count="$5"

  if [[ "$count" -eq 0 || -z "$dirs" ]]; then
    sketchybar --set "$item" drawing=off
  else
    local display_text="[$prefix]: $dirs"
    sketchybar --set "$item" \
      icon="$ICON" \
      icon.font="sketchybar-app-font:Regular:13.0" \
      icon.color="${RED_BRIGHT:-0xffD47766}" \
      label="$display_text" \
      label.color="$color" \
      drawing=on
  fi
}

# Update all items based on NAME or update all
case "${NAME}" in
*idle*)
  update_item "agent_gossips_idle" "IDLE" "${YELLOW_BRIGHT:-0xffEBC06D}" "$IDLE_DIRS" "$IDLE_COUNT"
  ;;
*cooking*)
  update_item "agent_gossips_cooking" "COOKING" "${GREEN_BRIGHT:-0xff85B695}" "$COOKING_DIRS" "$COOKING_COUNT"
  ;;
*notify*)
  update_item "agent_gossips_notify" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "$NOTIFY_DIRS" "$NOTIFY_COUNT"
  ;;
*)
  update_item "agent_gossips_idle" "IDLE" "${YELLOW_BRIGHT:-0xffEBC06D}" "$IDLE_DIRS" "$IDLE_COUNT"
  update_item "agent_gossips_cooking" "COOKING" "${GREEN_BRIGHT:-0xff85B695}" "$COOKING_DIRS" "$COOKING_COUNT"
  update_item "agent_gossips_notify" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "$NOTIFY_DIRS" "$NOTIFY_COUNT"
  ;;
esac
