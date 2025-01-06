#!/bin/bash

source "$CONFIG_DIR/colors.sh"

RAM_USAGE=$(free -h | awk '/Mem:/ {print int($4)}')

if [ "$RAM_USAGE" -gt "27" ]; then
  COLOR=$RED
else
  COLOR=$WHITE
fi

sketchybar --set "$NAME" \
  label="${RAM_USAGE}GB" \
  icon.color=$COLOR
