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
# Experimental pi profile: RLM mode (one `execute` tool, persistent Bun TS evaluator).
# PI_CODING_AGENT_DIR swaps ~/.pi/agent for ~/.pi/agent-rlm, which has its own
# settings.json (trimmed package list) and symlinks everything else back.
abbr pii "env PI_CODING_AGENT_DIR=\$HOME/.pi/agent-rlm PI_RLM_SUBAGENT_MODEL=llmgateway/azure/gpt-5.6-sol pi --rlm"
# Launch pi as a named role from ~/.agents/roles. `pir list` shows them.
abbr pir pi-role
abbr wm workmux
abbr cmra claude-mr-approver
abbr pt portless
abbr fab fabric

# # Docker Sandbox
# abbr dsbb "docker build --build-context claude-home=$HOME --build-context claude-dotfiles=$HOME/dotfiles -t claude-ts:latest $HOME/dotfiles/.config/docker-sandbox/"
# abbr dsb "docker sandbox run --load-local-template -t claude-ts:latest claude"
# abbr dsbl "docker sandbox ls"
# abbr dsbx "docker sandbox exec -it"
# abbr dsbr "docker sandbox rm"
# abbr dsbrm "docker sandbox ls -q | xargs docker sandbox rm"
