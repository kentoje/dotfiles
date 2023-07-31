function git_current_branch
    set -l ref (command git symbolic-ref --quiet HEAD 2> /dev/null)
    set -l ret $status
    if test $ret -ne 0
        if test $ret -eq 128
            return
        end
        set ref (command git rev-parse --short HEAD 2> /dev/null); or return
    end
    echo $ref | sed "s#^refs/heads/##"
end
