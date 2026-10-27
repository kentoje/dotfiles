#!/bin/sh
# Headless workflow children inherit the parent's pane id. Their global Claude
# hooks must not turn a Node service into an agent or create finished alerts.
# Use live process detection rather than the state the previous hook reported.
if [ -n "${TUIOS_PANE_ID:-}" ] && [ -n "${TUIOS_SESSION:-}" ]; then
	detection=$(tuios explain-agent-detect -s "$TUIOS_SESSION" -w "$TUIOS_PANE_ID" --json </dev/null 2>/dev/null) || exit 0
	printf '%s\n' "$detection" | jq -e -f "$(dirname "$0")/interactive-agent-detection.jq" >/dev/null 2>&1 || exit 0
fi

# Keep the native reporter's timeout, approval handling and original stdin.
exec tuios agent-hook claude-code --integration 3 "$@"
