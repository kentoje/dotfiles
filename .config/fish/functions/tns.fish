# function tns
#   tmux new-session -s "kento" -d
#   tmux new-window -t "kento" -n "work" "cd ~/Documents/github && exec fish"
#   tmux new-window -t "kento" -n "dotfiles" "cd ~/dotfiles && exec fish"
#   tmux new-window -t "kento" -n "vault" "cd ~/Documents/github/kentoje/obsidian-vault && exec fish"
#   tmux kill-window -t "kento:1"
#   tmux select-window -t "kento:1"
#   tmux attach-session -d
# end

function tns
  tmux new-session -s "misc" -d
  tmux new-window -t "misc"  "cd ~ && exec fish"
  tmux new-session -s "work" -d
  tmux new-window -t "work"  "cd ~/Documents/github && exec fish"
  tmux new-session -s "dotfiles" -d
  tmux new-window -t "dotfiles" "cd ~/dotfiles && exec fish"
  tmux new-session -s "vault" -d
  tmux new-window -t "vault" "cd ~/Documents/github/kentoje/obsidian-vault && exec fish"
  tmux kill-window -t "misc:1"
  tmux kill-window -t "work:1"
  tmux kill-window -t "dotfiles:1"
  tmux kill-window -t "vault:1"
  tmux attach-session -t "work" -d
end

