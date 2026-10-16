#!/bin/bash
# Focus an app's workspace. Launch the app only when it has no open window,
# which is also the case when it is not running. on-window-detected then
# moves the new window onto that workspace.
#
# Replaces the alt hotkeys previously bound in Hammerspoon. AeroSpace 0.20
# cannot chain "workspace || exec-and-forget" inside a binding, and
# exec-and-forget cannot run the aerospace CLI.

workspace="$1"
app_name="$2"

if [[ -z "$workspace" || -z "$app_name" ]]; then
	echo "usage: focus-or-launch.sh <workspace> <app-name>" >&2
	exit 1
fi

aerospace workspace "$workspace"

if ! aerospace list-windows --workspace "$workspace" --format '%{window-id}' | grep -q .; then
	open -a "$app_name"
fi
