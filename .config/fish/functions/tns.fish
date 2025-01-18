function tns
  tmux new-session -s "kento" -d
  tmux new-window -t "kento" -n "work" "cd ~/Documents/github && exec fish"
  tmux new-window -t "kento" -n "dotfiles" "cd ~/dotfiles && exec fish"
  tmux new-window -t "kento" -n "vault" "cd ~/Documents/github/kentoje/obsidian-vault && exec fish"
  tmux kill-window -t "kento:1"
  tmux select-window -t "kento:1"
  tmux attach-session -d
end

