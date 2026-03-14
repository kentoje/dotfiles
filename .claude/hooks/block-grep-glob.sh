#!/bin/bash
input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name')

case "$tool_name" in
  Read|Grep|Glob)
    echo "{\"decision\": \"deny\", \"reason\": \"$tool_name is blocked by policy. Use alternative tools instead.\"}" >&2
    exit 2
    ;;
esac
exit 0
