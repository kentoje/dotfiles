#!/bin/sh
# Closes the current tuios session without dropping the client: asks first,
# then switches it to the most recently active other session, then kills the
# one it left, like closing a herdr workspace. With no other session left it
# just kills it, and the client detaches as with the built-in
# prefix_close_session (which neither asks nor switches).
#
# Run from a popup [[keybindings.command]] key: it sets TUIOS_SESSION, and the
# popup gives gum the terminal it asks on.

current_session=${TUIOS_SESSION:?close-session-and-switch: TUIOS_SESSION is not set}

pane_count=$(tuios ls --json | jq -r --arg current "$current_session" '.[] | select(.name == $current) | .window_count')
agent_count=$(tuios list-agents -s "$current_session" --json | jq -r '.agents | length')
gum confirm --default=false \
	"Close session $current_session? ${pane_count:-?} panes, ${agent_count:-0} agents." || exit 0

next_session=$(tuios ls --json |
	jq -r --arg current "$current_session" \
		'[.[] | select(.name != $current and (.saved | not))] | sort_by(-.last_active) | .[0].name // empty') || exit 1

if [ -n "$next_session" ]; then
	# -s: switch the client that shows the session being closed.
	tuios switch-session -s "$current_session" "$next_session" >/dev/null || exit 1
fi
tuios kill-session "$current_session" >/dev/null
