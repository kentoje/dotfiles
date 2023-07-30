eval (/usr/local/bin/brew shellenv)

starship init fish | source
zoxide init fish | source

fish_add_path ~/.config/bin
fish_add_path ~/.config/fish/functions

set -U fish_greeting
set -U fish_key_bindings fish_vi_key_bindings
set -U fish_color_autosuggestion a5adce
set -Ux EDITOR nvim
set -Ux BAT_THEME Catppuccin-mocha

# FZF
set -Ux FZF_DEFAULT_OPTS "\
--reverse \
--border rounded \
--no-info \
--pointer='' \
--marker=' ' \
--ansi \
--color='16,bg+:-1,gutter:-1,prompt:5,pointer:5,marker:6,border:4,label:4,header:italic'"
set -Ux FZF_CTRL_R_OPTS "--border-label=' history ' \
--prompt='  '"
set -U FZF_CTRL_R_OPTS "--reverse"
set -U FZF_TMUX_OPTS "-p"

abbr n "nvim"
abbr v "nvim"
abbr c "clear"
abbr cl "clear"
abbr tn "tmux new -s (basename (pwd))"
abbr ls "lsd  --group-dirs first"
abbr la "lsd  --group-dirs first -A"
abbr ll "lsd  --group-dirs first -Al"
abbr lt "lsd  --group-dirs last -A --tree"
abbr shutd "osascript -e 'tell app \"System Events\" to shut down'"
abbr fcat "fzf --preview 'bat --color=always {}' | xargs nvim"
abbr fhistory "history | fzf"

