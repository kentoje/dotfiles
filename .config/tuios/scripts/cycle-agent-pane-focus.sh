#!/bin/sh
# Cycles focus through every agent pane in every tuios session, whatever its
# state: tuios's port of herdr's next_agent / previous_agent. tuios 0.10.1 only
# ships prefix_next_attention (agents waiting on you) and prefix_next_finished.
#
# Usage: cycle-agent-pane-focus.sh next|prev
# Run from a [[keybindings.command]] key, which sets TUIOS_ACTIVE_PANE_ID and
# TUIOS_SESSION to the pane and session the key was pressed in.

direction=${1:-next}
case "$direction" in
next | prev) ;;
*)
	echo "cycle-agent-pane-focus: direction must be next or prev, got $direction" >&2
	exit 2
	;;
esac

# One "window_id<TAB>session" row per agent, in session then workspace order.
# sort_by is stable, so panes keep tuios's order inside a workspace.
agent_rows=$(tuios list-agents --all-sessions --json |
	jq -r '.agents | sort_by(.session, .workspace) | .[] | "\(.window_id)\t\(.session)"') || exit 1
[ -n "$agent_rows" ] || exit 0

target_row=$(printf '%s\n' "$agent_rows" | awk -F '\t' -v current="$TUIOS_ACTIVE_PANE_ID" -v direction="$direction" '
	{ ids[NR] = $0; if ($1 == current) at = NR }
	END {
		if (!at) { print ids[direction == "next" ? 1 : NR]; exit }
		step = direction == "next" ? 1 : -1
		print ids[(at - 1 + step + NR) % NR + 1]
	}')

target_window=$(printf '%s' "$target_row" | cut -f1)
target_session=$(printf '%s' "$target_row" | cut -f2)

if [ "$target_session" != "$TUIOS_SESSION" ]; then
	# -s: switch the client showing the session the key was pressed in.
	tuios switch-session -s "$TUIOS_SESSION" "$target_session" >/dev/null || exit 1
fi
# Naming a window also switches to its workspace.
tuios focus-window -s "$target_session" "$target_window" >/dev/null
