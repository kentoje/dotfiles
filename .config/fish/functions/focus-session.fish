function focus-session
    set -l current_session (tmux display-message -p '#S')

    set -l choice (
        tmux list-sessions -F '{"name":"#{session_name}","windows":"#{session_windows}"}' \
        | jq -r --arg current "$current_session" '
            def pad($n): (. + " " * $n)[:$n];
            select(.name != $current)
            | "\(.name)\t\(.name | pad(14))\(.windows)"
          ' \
        | fzf --delimiter="\t" \
              --with-nth=2 \
              --header="
Session       Windows" \
              --prompt="sessions> " \
              --no-separator \
              --bind="ctrl-j:down,ctrl-k:up,alt-j:preview-down,alt-k:preview-up" \
              --preview="tmux list-windows -t {1} -F '  #{window_index}: #{window_name} (#{pane_current_path})'" \
              --preview-window="bottom:50%:wrap"
    )

    if test -z "$choice"
        return 0
    end

    set -l session_name (echo "$choice" | cut -f1)
    tmux switch-client -t "$session_name"
end
