# Async git status for the prompt, styled after the old gitmux statusline
# (.config/tmux/gitmux.yml). The prompt render does ZERO git work — it just
# prints the last computed string ($__git_async_str), which fish_prompt shows
# inline next to the path. A background worker recomputes after each prompt and
# signals this shell to repaint when ready, so the prompt is never blocked on
# git, regardless of repo size. The styling/compute lives in
# functions/__git_status_string.fish.

# Know the repo root on the very first prompt. fish_prompt also maintains this
# (on PWD change), but only once it has been autoloaded — which happens after
# the first fish_prompt event. One git call at startup, never per-prompt.
set -q __fish_cached_git_root; or set -g __fish_cached_git_root (command git rev-parse --show-toplevel 2>/dev/null)

# After each prompt, kick a background worker to recompute git status.
function __git_async_kick --on-event fish_prompt
    # Not in a repo? clear and stop. (reuses the root cached by fish_prompt)
    if test -z "$__fish_cached_git_root"
        set -g __git_async_str ''
        return
    end
    # One worker at a time — don't stack them up on rapid Enter presses.
    if set -q __git_async_pid; and kill -0 $__git_async_pid 2>/dev/null
        return
    end

    set -g __git_async_tmp (mktemp)
    set -l ppid $fish_pid
    set -l fn ~/.config/fish/functions/__git_status_string.fish
    # --no-config keeps worker startup fast; we source just the one function it needs.
    fish --no-config -c "source $fn; __git_status_string '$__fish_cached_git_root' > $__git_async_tmp; kill -USR1 $ppid" &
    set -g __git_async_pid $last_pid
    disown $last_pid 2>/dev/null
end

# Worker finished: load its output and repaint the prompt in place.
function __git_async_recv --on-signal USR1
    set -e __git_async_pid
    if set -q __git_async_tmp; and test -f "$__git_async_tmp"
        set -g __git_async_str (cat $__git_async_tmp)
        command rm -f $__git_async_tmp
    end
    commandline -f repaint 2>/dev/null
end

# Changed directory: drop stale status (and any in-flight worker) immediately so
# we never show another repo's status while the new one is being computed.
function __git_async_clear --on-variable PWD
    set -g __git_async_str ''
    if set -q __git_async_pid
        kill $__git_async_pid 2>/dev/null
        set -e __git_async_pid
    end
end
