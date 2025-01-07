function zcd
    if test -n "$argv"
        set -l result (zoxide query --list | fzf-tmux -p --query "$argv")
    else
        set -l result (zoxide query --list | fzf-tmux -p)
    end

    if test -n "$result"
        cd $result
    end
end
