#!/bin/bash

# Claude Code Hook Handler - Multi-session event-driven status updates

# Parse JSON input
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')

# Skip if missing required fields
[[ -z "$CWD" || -z "$HOOK_EVENT" ]] && exit 0

# Get Claude PID - try multiple methods
CLAUDE_PID=""
if [[ -n "$PPID" ]]; then
  CLAUDE_PID="$PPID"
elif [[ -n "$$" ]]; then
  CLAUDE_PID="$$"
else
  # Fallback: find claude process for this directory
  CLAUDE_PID=$(ps aux | grep claude | grep -v grep | head -1 | awk '{print $2}')
fi

[[ -z "$CLAUDE_PID" ]] && exit 0

# Set status based on hook event
if [[ "$HOOK_EVENT" == "UserPromptSubmit" ]]; then
  STATUS="r"
elif [[ "$HOOK_EVENT" == "Notification" ]]; then
  STATUS="n"
else
  STATUS="w"
fi

# Create session directory if needed
mkdir -p /tmp/claude_sessions

# Store session data
cat >"/tmp/claude_sessions/$CLAUDE_PID" <<EOF
CWD=$CWD
DIR_NAME=$(basename "$CWD")
STATUS=$STATUS
LAST_UPDATED=$(date +%s)
EOF

# Trigger SketchyBar event
sketchybar --trigger claude_session_update 2>/dev/null
