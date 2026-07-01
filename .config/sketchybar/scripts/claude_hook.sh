#!/bin/bash

# Claude Code Hook Handler - Multi-session event-driven status updates

# Parse JSON input
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Skip if missing session_id or hook_event
[[ -z "$SESSION_ID" || -z "$HOOK_EVENT" ]] && exit 0

# Extract CWD early — available on all hooks as a common field
JSON_CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# --- agent-gossips integration ---
# Forward the RAW Claude hook payload to agent-gossips. The server-side
# claude-code adapter owns ALL event->state mapping, including sub-agent
# filtering (agent_id), SubagentStop handling, and Notification subtypes.
# We only inject the PID (Claude hook JSON carries no pid) and tag the source.
printf '%s' "$INPUT" \
	| jq -c --argjson pid "$PPID" '. + {pid: $pid, source: "claude-code"}' 2>/dev/null \
	| curl -sf -o /dev/null -X POST "http://localhost:4000/events" \
		-H "Content-Type: application/json" --data-binary @- 2>/dev/null &
# --- end agent-gossips ---

# Create session directory if needed
SESSION_DIR="/tmp/claude_sessions"
mkdir -p "$SESSION_DIR"

SESSION_FILE="$SESSION_DIR/$SESSION_ID"

# Handle SessionEnd - cleanup and exit
if [[ "$HOOK_EVENT" == "SessionEnd" ]]; then
	rm -f "$SESSION_FILE"
	sketchybar --trigger claude_session_update 2>/dev/null
	exit 0
fi

# Load existing session data if available (to preserve CWD)
if [[ -f "$SESSION_FILE" ]]; then
	source "$SESSION_FILE"
fi

# Apply CWD from JSON if available
if [[ -n "$JSON_CWD" ]]; then
	CWD="$JSON_CWD"
	DIR_NAME=$(basename "$CWD")
fi

# Extract tool name for tool events
if [[ "$HOOK_EVENT" == "PreToolUse" || "$HOOK_EVENT" == "PostToolUse" ]]; then
	LAST_TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
fi

# Handle SessionStart - initialize with placeholder
if [[ "$HOOK_EVENT" == "SessionStart" ]]; then
	# SessionStart doesn't have cwd, use placeholder until first tool use
	if [[ -z "$CWD" ]]; then
		CWD="initializing"
		DIR_NAME="..."
	fi
	cat >"$SESSION_FILE" <<EOF
CWD=$CWD
DIR_NAME=$DIR_NAME
STATUS=w
PID=$PPID
LAST_TOOL=
LAST_UPDATED=$(date +%s)
EOF
	sketchybar --trigger claude_session_update 2>/dev/null
	exit 0
fi

# Set status based on event type
case "$HOOK_EVENT" in
"UserPromptSubmit" | "PreToolUse" | "PostToolUse")
	STATUS="r"
	;;
"Notification")
	STATUS="n"
	;;
"Stop")
	STATUS="w"
	;;
*)
	STATUS="w"
	;;
esac

# Fallback if no CWD available (shouldn't happen after SessionStart)
if [[ -z "$CWD" ]]; then
	CWD="unknown"
	DIR_NAME="?"
fi

# Update session file
cat >"$SESSION_FILE" <<EOF
CWD=$CWD
DIR_NAME=$DIR_NAME
STATUS=$STATUS
PID=$PPID
LAST_TOOL=$LAST_TOOL
LAST_UPDATED=$(date +%s)
EOF

# Trigger SketchyBar event
sketchybar --trigger claude_session_update 2>/dev/null
