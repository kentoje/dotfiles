function focus-agent
    set -l direct_agents 'opencode|aider|claude|codex|sgpt|cursor|copilot|assistant|crush|vibe|ollama|[0-9]+\.[0-9]+\.[0-9]+'
    set -l node_agents 'amp|gemini'
    set -l sep '|'

    set -l panes (tmux list-panes -a -F "#{pane_id}$sep#{session_name}:#{window_index}.#{pane_index}$sep#{pane_current_path}$sep#{pane_current_command}$sep#{pane_pid}")

    set -l agents
    for pane in $panes
        set -l fields (string split $sep $pane)
        set -l pane_id $fields[1]
        set -l location $fields[2]
        set -l cwd (basename $fields[3])
        set -l cmd $fields[4]
        set -l pid $fields[5]

        # Direct agent match
        if string match -rq "^($direct_agents)\$" -- $cmd
            set -a agents "$pane_id$sep$location$sep$cmd$sep$cwd"
            continue
        end

        # Node agent - find child process and check command
        if test "$cmd" = node
            set -l child_pid (pgrep -P $pid 2>/dev/null | head -1)

            if test -n "$child_pid"
                set -l child_cmd (ps -p $child_pid -o command= 2>/dev/null)
                set -l resolved (string match -r -- "$node_agents" $child_cmd)

                if test -n "$resolved"
                    set -a agents "$pane_id$sep$location$sep$resolved$sep$cwd"
                end
            end
        end
    end

    if test (count $agents) -eq 0
        echo "No agent panes found"
        return 0
    end

    set -l choice (
        for agent in $agents
            set -l f (string split $sep $agent)
            printf '%s\t%-16s%-12s%s\n' $f[1] $f[2] $f[3] $f[4]
        end \
        | fzf --delimiter="\t" \
              --with-nth=2 \
              --header="
Location        Command     Directory" \
              --prompt="agent panes> " \
              --no-separator \
              --bind="ctrl-j:down,ctrl-k:up,alt-j:preview-down,alt-k:preview-up" \
              --preview="tmux capture-pane -ep -t {1} | tail -200" \
              --preview-window="bottom:50%:wrap"
    )

    if test -z "$choice"
        return 0
    end

    set -l pane_id (string split \t $choice)[1]
    tmux switch-client -t "$pane_id"
end
