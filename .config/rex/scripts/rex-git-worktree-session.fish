#!/usr/bin/env fish
# Interactive half of the Rex new_git_worktree_session action
# (git-worktree-session.lua). Runs in a temporary zoomed pane, in the focused pane's cwd.
# Worktrees go where herdr puts them, so both tools see the same checkouts.
# $argv[1] is the ID of the Rex client that ran the action (may be empty).

set -l client_args
test -n "$argv[1]"; and set client_args -C $argv[1]

function fail_with_pause --argument-names message
    echo "rex worktree: $message"
    read -P 'press enter to close' -l _
    exit 1
end

set -l repo_root (git rev-parse --show-toplevel 2>/dev/null)
or fail_with_pause "not inside a git repository ("(pwd)")"

set -l repo (basename $repo_root)
read -P "$repo branch> " -l branch
test -n "$branch"; or exit 0

set -l worktree_path ~/.herdr/worktrees/$repo/(string replace -a / - -- $branch)

if not test -d $worktree_path
    if git -C $repo_root show-ref --quiet --verify refs/heads/$branch
        git -C $repo_root worktree add $worktree_path $branch
    else if git -C $repo_root show-ref --quiet --verify refs/remotes/origin/$branch
        git -C $repo_root worktree add --track -b $branch $worktree_path origin/$branch
    else
        git -C $repo_root worktree add -b $branch $worktree_path
    end
    or fail_with_pause "git worktree add failed"
end

set -l session_id (rex new "$repo/$branch" --cwd $worktree_path --json | jq -r '.session_id')
or fail_with_pause "rex new failed"

rex $client_args do session.select session_id=$session_id
or fail_with_pause "session created ($repo/$branch) but switching to it failed"
