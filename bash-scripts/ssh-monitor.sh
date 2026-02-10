#!/usr/bin/env bash

if [[ -z "${PUSHOVER_SSH_MONITOR_API_KEY:-}" ]]; then
  exit 1
fi

if [[ -z "${PUSHOVER_USER_KEY:-}" ]]; then
  exit 1
fi

from_ip="${SSH_CONNECTION%% *}"
user="${USER:-unknown}"
host="$(hostname)"
time="$(date)"

msg="SSH login: user=$USER from=$from_ip host=$host time=$time"

curl -s \
  -F "token=${PUSHOVER_SSH_MONITOR_API_KEY}" \
  -F "user=${PUSHOVER_USER_KEY}" \
  -F "message=SSH login: $msg" \
  https://api.pushover.net/1/messages.json \
  >/dev/null
