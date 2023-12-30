function fh
	set selected (history | fzf-tmux -p)

	if test -n "$selected"
		echo -e "Running: \e[32m$selected\e[0m"
		eval "$selected"
	end
end

