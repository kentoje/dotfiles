function ssh-monitor --description "Send SSH login notifications via Pushover"
    if not set -q PUSHOVER_SSH_MONITOR_API_KEY
        return 1
    end

    if not set -q PUSHOVER_USER_KEY
        return 1
    end

    set -l user "unknown"
    set -l remote_host "unknown"

    if set -q PAM_USER
        set user $PAM_USER
    end

    if set -q PAM_RHOST
        set remote_host $PAM_RHOST
    end

    set -l host (hostname)

    curl -s \
        -F "token=$PUSHOVER_SSH_MONITOR_API_KEY" \
        -F "user=$PUSHOVER_USER_KEY" \
        -F "message=SSH login: $user from $remote_host on $host" \
        https://api.pushover.net/1/messages.json \
        >/dev/null
end
