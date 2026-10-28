#!/bin/bash
# Launch an app only when its workspace has no window. The binding switches
# workspaces first so shell startup and CLI queries never delay focus.

workspace="$1"
app_name="$2"

if [[ -z "$workspace" || -z "$app_name" ]]; then
	echo "usage: launch-if-workspace-empty.sh <workspace> <app-name>" >&2
	exit 1
fi

window_ids=$(aerospace list-windows --workspace "$workspace" --format '%{window-id}') || exit 1

if [[ -z "$window_ids" ]]; then
	open -a "$app_name"
fi
