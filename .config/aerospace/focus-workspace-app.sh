#!/bin/bash
# Focus the assigned app's window, or open the app if it has no window here.
# The binding switches workspaces first so shell startup never delays the switch.

workspace="$1"
app_bundle_id="$2"

if [[ -z "$workspace" || -z "$app_bundle_id" ]]; then
	echo "usage: focus-workspace-app.sh <workspace> <app-bundle-id>" >&2
	exit 1
fi

window_ids=$(aerospace list-windows --workspace "$workspace" --app-bundle-id "$app_bundle_id" --format '%{window-id}') || exit 1

# A later shortcut may have switched workspaces while this helper was starting.
focused_workspace=$(aerospace list-workspaces --focused) || exit 1
[[ "$focused_workspace" == "$workspace" ]] || exit 0

if [[ -n "$window_ids" ]]; then
	aerospace focus --window-id "${window_ids%%$'\n'*}"
else
	open -b "$app_bundle_id"
fi
