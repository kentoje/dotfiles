function fga
	set -l res (git status --short | fzf --multi | awk '{print$2}')
	echo "$res" | xargs git add
end

