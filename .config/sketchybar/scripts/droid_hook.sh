#!/bin/bash

# Droid (Factory) Hook Handler - Multi-session event-driven status updates

# Parse JSON input
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Skip if missing session_id or hook_event
[[ -z "$SESSION_ID" || -z "$HOOK_EVENT" ]] && exit 0

# Extract CWD early — available on all hooks as a common field
JSON_CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# --- agent-gossips integration ---
GOSSIP_URL="http://localhost:4000/events"

gossip_send() {
	local state="$1"
	local dir="${JSON_CWD:-null}"
	[[ "$dir" != "null" ]] && dir="\"$dir\"" || dir="null"

	curl -sf -o /dev/null -X POST "$GOSSIP_URL" \
		-H "Content-Type: application/json" \
		-d "{\"session_id\":\"$SESSION_ID\",\"event_type\":\"$HOOK_EVENT\",\"state\":\"$state\",\"source\":\"droid\",\"pid\":$PPID,\"directory\":$dir}" 2>/dev/null &
}

# Map hooks to session states and send to agent-gossips
case "$HOOK_EVENT" in
"SessionStart") gossip_send "idle" ;;
"SessionEnd") gossip_send "terminated" ;;
"UserPromptSubmit") gossip_send "running" ;;
"Stop" | "SubagentStop") gossip_send "idle" ;;
"Notification") gossip_send "waiting_for_answer" ;;
"PreToolUse" | "PostToolUse")
	local_session="/tmp/droid_sessions/$SESSION_ID"
	if [[ -f "$local_session" ]]; then
		prev=$(sed -n 's/^STATUS=//p' "$local_session" 2>/dev/null)
		[[ "$prev" != "r" ]] && gossip_send "running"
	else
		gossip_send "running"
	fi
	;;
esac
# --- end agent-gossips ---

# Create session directory if needed
SESSION_DIR="/tmp/droid_sessions"
mkdir -p "$SESSION_DIR"

SESSION_FILE="$SESSION_DIR/$SESSION_ID"

# Handle SessionEnd - cleanup and exit
if [[ "$HOOK_EVENT" == "SessionEnd" ]]; then
	rm -f "$SESSION_FILE"
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
"Stop" | "SubagentStop")
	STATUS="w"
	;;
*)
	STATUS="w"
	;;
esac

# Fallback if no CWD available
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
