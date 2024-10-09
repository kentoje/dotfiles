# eval (/usr/local/bin/brew shellenv)

starship init fish | source
zoxide init fish | source

fish_add_path ~/.config/bin
fish_add_path ~/.config/fish/functions
fish_add_path ~/.cargo/bin
fish_add_path /opt/homebrew/bin
fish_add_path /opt/homebrew/sbin

# Nix darwin
fish_add_path /run/current-system/sw/bin

set path (dirname (realpath ~/.config/fish/config.fish))

source $path/includes/global.fish
source $path/includes/fzf.fish
source $path/includes/private-vars.fish
source $path/includes/abbr.fish
source $path/includes/alias.fish


# pnpm
set -gx PNPM_HOME "/Users/kento/Library/pnpm"
if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end
