# Nvim
abbr n nvim
abbr v nvim

# Day to day
abbr ad aider
abbr c clear
abbr cm nice_commit
abbr cd z
abbr ta "tmux attach"
abbr tn "tmux new -s (basename (pwd))"
abbr treh "tmux select-layout even-horizontal"
abbr trmh "tmux select-layout main-horizontal"
abbr trmv "tmux select-layout main-vertical"
abbr trt "tmux select-layout tiled"
abbr tk "tmux kill-session -t"
abbr tka "tmux kill-session -a"
abbr tls "tmux ls"
abbr ls "lsd  --group-dirs first"
abbr la "lsd  --group-dirs first -A"
abbr l "lsd  --group-dirs first -Al"
abbr ll "lsd  --group-dirs first -Al"
abbr lt "lsd  --group-dirs last -A --tree"
abbr lz lazygit
abbr ol ollama
abbr pn pnpm
abbr zn "zellij -s aircall --layout ~/.config/zellij/layouts/work.kdl"
abbr za "zellij attach"
abbr zl "zellij list-sessions"

# Misc
abbr yz yazi
abbr shutd "osascript -e 'tell app \"System Events\" to shut down'"
abbr fcat "fzf --preview 'bat --color=always {}' | xargs nvim"
abbr fhistory "history | fzf | fish"
abbr gbr "git branch --sort=-committerdate | fzf-tmux -p | xargs -I {} git checkout {}"
abbr gacp "git add . && git commit --amend -n --no-edit && git push --force-with-lease"
abbr :q exit
abbr :wq exit

abbr op opencode
abbr dro droid
abbr wm workmux
