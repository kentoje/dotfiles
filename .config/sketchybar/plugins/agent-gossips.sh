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

# Get icons for each source
ICON_CLAUDE=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")
ICON_DROID=$($CONFIG_DIR/plugins/icon_map_fn.sh "Bilibili")

# Icon colors per source
ICON_COLOR_CLAUDE="${RED_BRIGHT:-0xffD47766}"
ICON_COLOR_DROID="${GREEN_BRIGHT:-0xff85B695}"

# Build combined icon string + color from unique sources in a state category
# Sets: _icons (string) and _icon_color (hex)
get_icons_for_state() {
  local state_filter="$1"
  local sources
  sources=$(echo "$STATE" | jq -r --arg sf "$state_filter" '
    [.instances[] |
    select(
      if $sf == "idle" then .state == "idle"
      elif $sf == "running" then .state == "running"
      else (.state == "waiting_for_permission" or .state == "waiting_for_answer" or .state == "retry")
      end
    ) | .source // "claude-code"] | unique | .[]
  ')
  local icons=""
  local has_claude=0 has_droid=0
  while IFS= read -r src; do
    [[ -z "$src" ]] && continue
    case "$src" in
      droid) icons="${icons}${ICON_DROID}"; has_droid=1 ;;
      *) icons="${icons}${ICON_CLAUDE}"; has_claude=1 ;;
    esac
  done <<< "$sources"
  _icons="$icons"
  if [[ $has_droid -eq 1 && $has_claude -eq 0 ]]; then
    _icon_color="$ICON_COLOR_DROID"
  elif [[ $has_claude -eq 1 && $has_droid -eq 0 ]]; then
    _icon_color="$ICON_COLOR_CLAUDE"
  else
    _icon_color="$ICON_COLOR_CLAUDE"
  fi
}

# Categorize instances by state
IDLE_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "idle") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)
COOKING_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "running") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)
NOTIFY_DIRS=$(echo "$STATE" | jq -r '.instances[] | select(.state == "waiting_for_permission" or .state == "waiting_for_answer" or .state == "retry") | .directory // "unknown" | split("/") | .[-1]' | paste -sd ', ' -)

# Get combined icons + colors per category
get_icons_for_state "idle";    IDLE_ICONS="$_icons";    IDLE_ICON_COLOR="$_icon_color"
get_icons_for_state "running"; COOKING_ICONS="$_icons";  COOKING_ICON_COLOR="$_icon_color"
get_icons_for_state "notify";  NOTIFY_ICONS="$_icons";   NOTIFY_ICON_COLOR="$_icon_color"

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
  local icons="$6"
  local icon_color="$7"

  if [[ "$count" -eq 0 || -z "$dirs" ]]; then
    sketchybar --set "$item" drawing=off
  else
    local display_text="[$prefix]: $dirs"
    sketchybar --set "$item" \
      icon="$icons" \
      icon.font="sketchybar-app-font:Regular:13.0" \
      icon.color="$icon_color" \
      label="$display_text" \
      label.color="$color" \
      drawing=on
  fi
}

# Update all items based on NAME or update all
case "${NAME}" in
*idle*)
  update_item "agent_gossips_idle" "IDLE" "${YELLOW_BRIGHT:-0xffEBC06D}" "$IDLE_DIRS" "$IDLE_COUNT" "$IDLE_ICONS" "$IDLE_ICON_COLOR"
  ;;
*cooking*)
  update_item "agent_gossips_cooking" "COOKING" "${GREEN_BRIGHT:-0xff85B695}" "$COOKING_DIRS" "$COOKING_COUNT" "$COOKING_ICONS" "$COOKING_ICON_COLOR"
  ;;
*notify*)
  update_item "agent_gossips_notify" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "$NOTIFY_DIRS" "$NOTIFY_COUNT" "$NOTIFY_ICONS" "$NOTIFY_ICON_COLOR"
  ;;
*)
  update_item "agent_gossips_idle" "IDLE" "${YELLOW_BRIGHT:-0xffEBC06D}" "$IDLE_DIRS" "$IDLE_COUNT" "$IDLE_ICONS" "$IDLE_ICON_COLOR"
  update_item "agent_gossips_cooking" "COOKING" "${GREEN_BRIGHT:-0xff85B695}" "$COOKING_DIRS" "$COOKING_COUNT" "$COOKING_ICONS" "$COOKING_ICON_COLOR"
  update_item "agent_gossips_notify" "!" "${MAUVE_BRIGHT:-0xff89B3B6}" "$NOTIFY_DIRS" "$NOTIFY_COUNT" "$NOTIFY_ICONS" "$NOTIFY_ICON_COLOR"
  ;;
esac
