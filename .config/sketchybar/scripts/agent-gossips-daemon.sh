#!/bin/bash

# Agent Gossips Daemon - SSE listener + periodic polling for SketchyBar
# Maintains state in /tmp/agent-gossips/instances.json
# Triggers sketchybar events on state changes

API_BASE="http://localhost:4000"
STATE_DIR="/tmp/agent-gossips"
STATE_FILE="$STATE_DIR/instances.json"
PID_FILE="$STATE_DIR/daemon.pid"
POLL_INTERVAL=5

mkdir -p "$STATE_DIR"

# Cleanup on exit
cleanup() {
	rm -f "$PID_FILE"
	[[ -n "$SSE_PID" ]] && kill "$SSE_PID" 2>/dev/null
	[[ -n "$POLL_PID" ]] && kill "$POLL_PID" 2>/dev/null
	exit 0
}
trap cleanup EXIT INT TERM

# Check if already running
if [[ -f "$PID_FILE" ]]; then
	OLD_PID=$(cat "$PID_FILE")
	if kill -0 "$OLD_PID" 2>/dev/null; then
		echo "Daemon already running (PID: $OLD_PID)"
		exit 1
	fi
fi
echo $$ >"$PID_FILE"

# Initialize state file
echo '{"instances":[]}' >"$STATE_FILE"

# Fetch all instances and write to state file
fetch_instances() {
	local response
	response=$(curl -sf "$API_BASE/instances" 2>/dev/null)
	if [[ $? -eq 0 && -n "$response" ]]; then
		echo "$response" | jq -c '{instances: .instances}' >"$STATE_FILE" 2>/dev/null
		return 0
	fi
	return 1
}

# Update single instance state in state file
update_instance_state() {
	local session_id="$1"
	local state="$2"
	local directory="$3"

	local current
	current=$(cat "$STATE_FILE" 2>/dev/null || echo '{"instances":[]}')

	# Check if instance exists
	local exists
	exists=$(echo "$current" | jq -r --arg sid "$session_id" '.instances | map(select(.session_id == $sid)) | length')

	if [[ "$exists" -gt 0 ]]; then
		# Update existing instance
		echo "$current" | jq -c --arg sid "$session_id" --arg st "$state" \
			'.instances = [.instances[] | if .session_id == $sid then .state = $st else . end]' >"$STATE_FILE"
	else
		# Add new instance
		echo "$current" | jq -c --arg sid "$session_id" --arg st "$state" --arg dir "$directory" \
			'.instances += [{"session_id": $sid, "state": $st, "directory": $dir}]' >"$STATE_FILE"
	fi
}

# Remove instance from state file
remove_instance() {
	local session_id="$1"
	local current
	current=$(cat "$STATE_FILE" 2>/dev/null || echo '{"instances":[]}')
	echo "$current" | jq -c --arg sid "$session_id" '.instances = [.instances[] | select(.session_id != $sid)]' >"$STATE_FILE"
}

# Trigger sketchybar update
trigger_update() {
	sketchybar --trigger agent_gossip_update 2>/dev/null
}

# SSE listener - runs in background
sse_listener() {
	while true; do
		curl -sfN "$API_BASE/instances/subscribe" 2>/dev/null | while IFS= read -r line; do
			# Skip empty lines
			[[ -z "$line" ]] && continue

			# Parse SSE format: "event: <type>" or "data: <json>"
			if [[ "$line" == event:* ]]; then
				EVENT_TYPE="${line#event: }"
			elif [[ "$line" == data:* ]]; then
				DATA="${line#data: }"

				case "$EVENT_TYPE" in
				"state")
					local sid state dir
					sid=$(echo "$DATA" | jq -r '.session_id // empty')
					state=$(echo "$DATA" | jq -r '.state // empty')
					dir=$(echo "$DATA" | jq -r '.directory // empty')

					if [[ -n "$sid" && -n "$state" && "$state" != "terminated" ]]; then
						update_instance_state "$sid" "$state" "$dir"
						trigger_update
					fi
					;;
				"deleted")
					local sid
					sid=$(echo "$DATA" | jq -r '.session_id // empty')
					if [[ -n "$sid" ]]; then
						remove_instance "$sid"
						trigger_update
					fi
					;;
				"connected")
					# Initial connection - fetch full state
					fetch_instances && trigger_update
					;;
				esac
			fi
		done

		# Connection lost, wait before reconnecting
		sleep 2
	done
}

# Polling loop - runs in background
poll_loop() {
	while true; do
		sleep "$POLL_INTERVAL"
		if fetch_instances; then
			trigger_update
		fi
	done
}

# Initial fetch
fetch_instances && trigger_update

# Start SSE listener in background
sse_listener &
SSE_PID=$!

# Start polling loop in background
poll_loop &
POLL_PID=$!

# Wait for children
wait
