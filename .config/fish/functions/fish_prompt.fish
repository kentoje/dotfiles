function fish_prompt
    set -l last_status $status

    # Transient prompt: collapse previous prompts to just ❯
    if contains -- --final-rendering $argv
        set_color --bold green
        echo -n '❯ '
        set_color normal
        return
    end

    # Directory (blue bold) - starship-style: repo root + relative path, or truncated to 3 segments
    set_color --bold blue
    if test -n "$__fish_cached_git_root"
        set -l repo_name (string replace -r '.*/' '' $__fish_cached_git_root)
        set -l rel (string replace "$__fish_cached_git_root" '' $PWD)
        echo -n "$repo_name$rel"
    else
        # Outside git: show last 3 segments, with ~ for home
        set -l dir (string replace $HOME '~' $PWD)
        set -l parts (string split '/' $dir)
        if test (count $parts) -le 3
            echo -n $dir
        else
            echo -n (string join '/' $parts[-3..-1])
        end
    end
    set_color normal

    echo

    # Character: ❯ insert,  normal (vim), red on error
    if test $last_status -ne 0
        set_color --bold red
        echo -n ' '
    else if test "$fish_bind_mode" = default
        set_color --bold magenta
        echo -n ' '
    else
        set_color --bold green
        echo -n '❯ '
    end
    set_color normal
end

# Cache git root — only re-evaluate on directory change, not every prompt
function __fish_update_git_root --on-variable PWD
    set -g __fish_cached_git_root (command git rev-parse --show-toplevel 2>/dev/null)
end

# Initialize cache for current directory
__fish_update_git_root
