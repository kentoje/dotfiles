function fga
	set -l res (git status --short | fzf-tmux -p --multi | awk '{print$2}')
	echo "$res" | xargs git add
end

