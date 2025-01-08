function zcd
    if test -n "$argv"
        set result (zoxide query --list | fzf-tmux -p --query "$argv")
    else
        set result (zoxide query --list | fzf-tmux -p)
    end

    if test -n "$result"
        z $result
    end
end
