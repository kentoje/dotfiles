eval (/usr/local/bin/brew shellenv)

starship init fish | source
zoxide init fish | source

fish_add_path ~/.config/bin
fish_add_path ~/.config/fish/functions

source includes/global.fish
source includes/fzf.fish
source includes/private-vars.fish
source includes/abbr.fish
