#!/bin/bash
# Read JSON input once
input=$(cat)

# Helper functions for common extractions
get_model_name() { echo "$input" | jq -r '.model.display_name'; }
get_current_dir() { echo "$input" | jq -r '.workspace.current_dir'; }
get_project_dir() { echo "$input" | jq -r '.workspace.project_dir'; }
get_version() { echo "$input" | jq -r '.version'; }
get_cost() { echo "$input" | jq -r '.cost.total_cost_usd'; }
get_duration() { echo "$input" | jq -r '.cost.total_duration_ms'; }
get_lines_added() { echo "$input" | jq -r '.cost.total_lines_added'; }
get_lines_removed() { echo "$input" | jq -r '.cost.total_lines_removed'; }

# Color codes
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

# Use the helpers
MODEL=$(get_model_name)
CURRENT_DIR=$(get_current_dir)
COST=$(get_cost)
LINES_ADDED=$(get_lines_added)
LINES_REMOVED=$(get_lines_removed)

# Get current dir and its parent (last 2 path components)
DIR_PATH=$(echo "$CURRENT_DIR" | awk -F/ '{print $(NF-1)"/"$NF}')

# Format cost to 2 decimal places
COST_FORMATTED=$(printf "%.2f" "$COST")

echo -e "[$MODEL] $DIR_PATH ${GREEN}[+$LINES_ADDED]${RESET} ${RED}[-$LINES_REMOVED]${RESET} :: ${GREEN}\$$COST_FORMATTED${RESET}"
