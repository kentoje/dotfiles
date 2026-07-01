#!/bin/bash

# Agent Gossips SketchyBar Plugin
# Reads state from /tmp/agent-gossips/instances.json
# Updates 5 display items: idle, cooking, and the three "needs you" reasons
# (perm = waiting_for_permission, answer = waiting_for_answer, retry = retry).

CONFIG_DIR="${CONFIG_DIR:-/Volumes/HomeX/kento/dotfiles/.config/sketchybar}"
[[ -f "$CONFIG_DIR/colors.sh" ]] && source "$CONFIG_DIR/colors.sh"

STATE_FILE="/tmp/agent-gossips/instances.json"

ALL_ITEMS="agent_gossips_idle agent_gossips_cooking agent_gossips_perm agent_gossips_answer agent_gossips_retry"

hide_all() {
  for it in $ALL_ITEMS; do sketchybar --set "$it" drawing=off; done
}

# Read state file
if [[ ! -f "$STATE_FILE" ]]; then
  hide_all
  exit 0
fi

STATE=$(cat "$STATE_FILE" 2>/dev/null)
if [[ -z "$STATE" || "$STATE" == "null" ]]; then
  hide_all
  exit 0
fi

# Get icons for each source
ICON_CLAUDE=$($CONFIG_DIR/plugins/icon_map_fn.sh "Claude")
ICON_DROID=$($CONFIG_DIR/plugins/icon_map_fn.sh "Bilibili")

# Icon colors per source
ICON_COLOR_CLAUDE="${RED_BRIGHT:-0xffD47766}"
ICON_COLOR_DROID="${GREEN_BRIGHT:-0xff85B695}"

# Build combined icon string + color from unique sources in a state category.
# $1 is a filter keyword: idle | running | perm | answer | retry
# Sets: _icons (string) and _icon_color (hex)
get_icons_for_state() {
  local state_filter="$1"
  local sources
  sources=$(echo "$STATE" | jq -r --arg sf "$state_filter" '
    [.instances[] |
    select(
      if $sf == "idle" then .state == "idle"
      elif $sf == "running" then .state == "running"
      elif $sf == "perm" then .state == "waiting_for_permission"
      elif $sf == "answer" then .state == "waiting_for_answer"
      elif $sf == "retry" then .state == "retry"
      else false
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
  else
    _icon_color="$ICON_COLOR_CLAUDE"
  fi
}

# Project basenames per category, comma-separated (consistent ", " join)
dirs_for() {
  echo "$STATE" | jq -r --arg s "$1" '[.instances[] | select(.state == $s) | (.directory // "unknown" | split("/") | .[-1])] | join(", ")'
}
count_for() {
  echo "$STATE" | jq --arg s "$1" '[.instances[] | select(.state == $s)] | length'
}

IDLE_DIRS=$(dirs_for "idle")
COOKING_DIRS=$(dirs_for "running")
PERM_DIRS=$(dirs_for "waiting_for_permission")
ASK_DIRS=$(dirs_for "waiting_for_answer")
RETRY_DIRS=$(dirs_for "retry")

IDLE_COUNT=$(count_for "idle")
COOKING_COUNT=$(count_for "running")
PERM_COUNT=$(count_for "waiting_for_permission")
ASK_COUNT=$(count_for "waiting_for_answer")
RETRY_COUNT=$(count_for "retry")

# Update function
update_item() {
  local item="$1"
  local prefix="$2"
  local color="$3"
  local dirs="$4"
  local count="$5"
  local filter="$6"

  if [[ "$count" -eq 0 || -z "$dirs" ]]; then
    sketchybar --set "$item" drawing=off
    return
  fi

  get_icons_for_state "$filter"

  sketchybar --set "$item" \
    icon="$_icons" \
    icon.font="sketchybar-app-font:Regular:13.0" \
    icon.color="$_icon_color" \
    label="[$prefix]: $dirs" \
    label.color="$color" \
    drawing=on
}

set_idle()    { update_item "agent_gossips_idle"    "IDLE"    "${YELLOW_BRIGHT:-0xffEBC06D}" "$IDLE_DIRS"    "$IDLE_COUNT"    "idle"; }
set_cooking() { update_item "agent_gossips_cooking" "COOKING" "${GREEN_BRIGHT:-0xff85B695}"  "$COOKING_DIRS" "$COOKING_COUNT" "running"; }
set_perm()    { update_item "agent_gossips_perm"    "PERM"    "${RED_BRIGHT:-0xffD47766}"    "$PERM_DIRS"    "$PERM_COUNT"    "perm"; }
set_answer()  { update_item "agent_gossips_answer"  "ASK"     "${PURPLE_BRIGHT:-0xffCF9BC2}" "$ASK_DIRS"     "$ASK_COUNT"     "answer"; }
set_retry()   { update_item "agent_gossips_retry"   "RETRY"   "${MAUVE_BRIGHT:-0xff89B3B6}"  "$RETRY_DIRS"   "$RETRY_COUNT"   "retry"; }

# Update the item matching this invocation's NAME, or all when called bare.
case "${NAME}" in
  *idle*)    set_idle ;;
  *cooking*) set_cooking ;;
  *perm*)    set_perm ;;
  *answer*)  set_answer ;;
  *retry*)   set_retry ;;
  *)         set_idle; set_cooking; set_perm; set_answer; set_retry ;;
esac
