# eval (/usr/local/bin/brew shellenv)

starship init fish | source
zoxide init fish | source

fish_add_path ~/.config/bin
fish_add_path ~/.config/fish/functions
fish_add_path ~/.cargo/bin

set path (dirname (realpath ~/.config/fish/config.fish))

source $path/includes/global.fish
source $path/includes/fzf.fish
source $path/includes/private-vars.fish
source $path/includes/abbr.fish
source $path/includes/alias.fish
source $path/includes/nvm-fix.fish

