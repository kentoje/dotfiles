#!/bin/sh
# Cycles focus through interactive agent panes in every tuios session, whatever
# their state: tuios's port of herdr's next_agent / previous_agent. tuios 0.10.1 only
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

# One "window_id<TAB>session" row per interactive agent, in session then workspace order.
# sort_by is stable, so panes keep tuios's order inside a workspace.
agent_list=$(tuios list-agents --all-sessions --json) || exit 1
agent_rows=$(printf '%s\n' "$agent_list" |
	jq -r '.agents | sort_by(.session, .workspace) | .[] | [.window_id, .session, (.protocol // "")] | @tsv' |
	while IFS="$(printf '\t')" read -r window_id session protocol; do
		# Protocol panes have their own conversation UI. For terminal agents,
		# ignore stale hook reports from workflow children that already exited.
		if [ -z "$protocol" ]; then
			detection=$(tuios explain-agent-detect -s "$session" -w "$window_id" --json) || continue
			printf '%s\n' "$detection" | jq -e -f "$(dirname "$0")/interactive-agent-detection.jq" >/dev/null || continue
		fi
		printf '%s\t%s\n' "$window_id" "$session"
	done) || exit 1
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
