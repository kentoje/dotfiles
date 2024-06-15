# Nvim
abbr n "nvim"
abbr v "nvim"

# Day to day
abbr c "clear"
abbr cm "nice_commit"
abbr cd "z"
abbr cl "clear"
abbr ta "tmux attach"
abbr tn "tmux new -s (basename (pwd))"
abbr tk "tmux kill-session -t"
abbr tka "tmux kill-session -a"
abbr tls "tmux ls"
abbr ls "lsd  --group-dirs first"
abbr la "lsd  --group-dirs first -A"
abbr l "lsd  --group-dirs first -Al"
abbr ll "lsd  --group-dirs first -Al"
abbr lt "lsd  --group-dirs last -A --tree"
abbr lz "lazygit"
abbr zn "zellij -s aircall --layout ~/.config/zellij/layouts/default.kdl"
abbr za "zellij attach"
abbr zl "zellij list-sessions"

# Misc
abbr shutd "osascript -e 'tell app \"System Events\" to shut down'"
abbr fcat "fzf --preview 'bat --color=always {}' | xargs nvim"
abbr fhistory "history | fzf"
abbr gbr "git branch --sort=-committerdate | fzf-tmux -p | xargs -I {} git checkout {}"
abbr gacp "git add . && git commit --amend -n --no-edit && git push --force-with-lease"
abbr :q "exit"
abbr :wq "exit"

