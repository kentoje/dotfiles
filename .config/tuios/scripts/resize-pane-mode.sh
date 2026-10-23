#!/bin/bash
# Resizes the focused tuios pane from the keyboard until you leave, like herdr's
# resize mode: h/j/k/l move a border by 5%, H/J/K/L by 15%, Esc, q, Enter or r
# quit. tuios 0.10.1 has no modal resize; its prefix repeat only re-runs a
# chord inside half a second.
#
# Run from a popup [[keybindings.command]] key: it sets TUIOS_ACTIVE_PANE_ID to
# the pane the key was pressed in, and the popup gives read its keys. Each move
# goes through tuios's herdr shim, whose pane resize has herdr's semantics.
#
# Leaving the popup some other way (a click, a Cmd key, another workspace)
# also ends the mode, within a second: an unfocused popup gets no keys, so it
# would otherwise stay on screen with nothing able to close it.

target_pane=${TUIOS_ACTIVE_PANE_ID:?resize-pane-mode: TUIOS_ACTIVE_PANE_ID is not set}
popup_pane=${TUIOS_PANE_ID:?resize-pane-mode: TUIOS_PANE_ID is not set}
herdr_shim=${HERDR_BIN_PATH:?resize-pane-mode: HERDR_BIN_PATH is not set}

resize_target_pane() {
	"$herdr_shim" pane resize --pane "$target_pane" --direction "$1" --amount "$2" >/dev/null 2>&1
}

popup_has_focus() {
	[ "$(tuios list-windows --json 2>/dev/null | jq -r .focused_window_id)" = "$popup_pane" ]
}

printf '\e[?25l'
printf ' RESIZE  h j k l  5%%   H J K L  15%%\n'
printf '         esc  q  enter  r      done'

# macOS bash 3.2 reports a read timeout and end of input alike, so the loop
# below needs keys from a terminal, never a pipe that could end.
[ -t 0 ] || {
	echo "resize-pane-mode: needs a terminal on standard input" >&2
	exit 2
}

while true; do
	# Whole seconds only on bash 3.2. A timeout is the moment to check focus.
	if ! IFS= read -rsn1 -t 1 key; then
		popup_has_focus || exit 0
		continue
	fi
	case "$key" in
	h) resize_target_pane left 0.05 ;;
	j) resize_target_pane down 0.05 ;;
	k) resize_target_pane up 0.05 ;;
	l) resize_target_pane right 0.05 ;;
	H) resize_target_pane left 0.15 ;;
	J) resize_target_pane down 0.15 ;;
	K) resize_target_pane up 0.15 ;;
	L) resize_target_pane right 0.15 ;;
	$'\e' | q | r | '') exit 0 ;;
	esac
done
