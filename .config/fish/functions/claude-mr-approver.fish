function claude-mr-approver --description "Restricted Claude: watch a Slack channel and auto-approve low-risk GitLab MRs"
    # --- config -------------------------------------------------------------
    set -l bot_dir ~/dotfiles/.config/claude-mr-bot
    set -l runtime ~/.local/share/claude-mr-bot # state only (NOT a config dir — see note below)
    set -l interval 300 # seconds between polls
    set -l claude_bin ~/.local/bin/claude
    set -l model sonnet # simple, repetitive task — opus is overkill
    set -l notify_dm $MR_BOT_NOTIFY_DM # DM to ping when an MR can't be auto-approved
    test -n "$notify_dm"; or set notify_dm D02HB6U23N0

    # NOTE: we run in the DEFAULT config dir (no CLAUDE_CONFIG_DIR override) on purpose:
    # the company "claude.ai Slack" connector is authenticated there. That also rules out
    # --strict-mcp-config (it would drop the connector). Restriction is therefore enforced
    # entirely by the allow/deny tool lists below.

    # --- preflight ----------------------------------------------------------
    if not set -q MR_BOT_SLACK_CHANNEL
        echo "claude-mr-approver: set \$MR_BOT_SLACK_CHANNEL (channel name/id to watch)" >&2
        return 1
    end
    if not command -q glab; or not glab auth status >/dev/null 2>&1
        echo "claude-mr-approver: glab not authenticated (run: glab auth login)" >&2
        return 1
    end
    mkdir -p $runtime/state

    # WHITELIST: the only tools the bot may use. mcp__claude_ai_Slack = the whole
    # (Slack-only) connector; glab is read-only EXCEPT `glab mr approve`; no `glab api`.
    set -l allowed \
        mcp__claude_ai_Slack \
        "Bash(glab mr view:*)" \
        "Bash(glab mr diff:*)" \
        "Bash(glab mr list:*)" \
        "Bash(glab mr approve:*)" \
        "Bash(glab ci:*)" \
        "Bash(jq:*)"

    # DENYLIST: deny wins over allow. Explicitly kill the read-only built-ins that are
    # otherwise AUTO-ALLOWED (Read/Glob/Grep/LS) plus mutators and escape hatches.
    set -l denied \
        Read Edit Write NotebookEdit \
        Glob Grep \
        WebFetch WebSearch \
        Task Agent \
        "Bash(glab api:*)"

    echo "claude-mr-approver: watching '$MR_BOT_SLACK_CHANNEL' with model=$model (Ctrl-C to stop)"
    while true
        set -l last_ts (cat $runtime/state/last_ts 2>/dev/null; or echo 0)

        # `env -u ANTHROPIC_API_KEY`: ignore any (stale/invalid) API key in the env so
        # headless `-p` falls back to your subscription / `claude setup-token` login.
        set -l out (env -u ANTHROPIC_API_KEY CLAUDE_CODE_NO_FLICKER=1 \
            $claude_bin -p "Watch the Slack channel '$MR_BOT_SLACK_CHANNEL'. Act ONLY on messages whose Slack ts is strictly greater than $last_ts (ignore everything at or before it). When an MR can't be auto-approved, DM the human at Slack id '$notify_dm'. Apply the MR-approval policy. End with the mandatory NEWEST_TS line." \
            --model $model \
            --append-system-prompt (cat $bot_dir/policy.md | string collect) \
            --permission-mode default \
            --allowedTools $allowed \
            --disallowedTools $denied 2>&1)

        # advance the cursor only if the bot reported a newer timestamp
        set -l new_ts (printf '%s\n' $out | string match -rg 'NEWEST_TS=([0-9.]+)')
        if test -n "$new_ts"
            echo $new_ts >$runtime/state/last_ts
        end

        printf '%s\n' $out | string match -rv '^NEWEST_TS=' # echo bot activity, hide the marker
        sleep $interval
    end
end
