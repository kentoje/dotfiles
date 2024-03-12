function zz
    set -l result (zoxide query --list | fzf-tmux -p)
    if test -n "$result"
        cd $result
    end
end
