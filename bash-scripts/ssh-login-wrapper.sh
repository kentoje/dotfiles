#!/bin/bash

# Setup in /private/etc/ssh/sshd_config, calls Pushover on SSH login.

# If this is a command/scp/rsync/sftp session, run it and do NOT notify
if [[ -n "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  exec $SSH_ORIGINAL_COMMAND
fi

# Only notify when we have a TTY (interactive login)
if [[ -n "${SSH_CONNECTION:-}" ]] && /usr/bin/tty -s; then
  /usr/bin/logger -t ssh-monitor "SSH login: user=$USER from=${SSH_CONNECTION%% *} host=$(hostname) time=$(date)"
  /usr/local/bin/ssh-monitor.sh >/dev/null 2>&1 &
fi

# Continue normal session
exec "$SHELL" -l
