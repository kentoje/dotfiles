# eval (/usr/local/bin/brew shellenv)

starship init fish | source
enable_transience

zoxide init fish | source
atuin init fish | source

# oh-my-posh init fish --config ~/.config/oh-my-posh/config.toml | source

# Nix darwin
fish_add_path /run/current-system/sw/bin
fish_add_path ~/.config/bin
fish_add_path ~/.config/fish/functions
fish_add_path ~/.cargo/bin
fish_add_path ~/.local/bin

fish_add_path /opt/homebrew/bin
fish_add_path ~/.local/share/nvim/mason/bin
# fish_add_path /opt/homebrew/sbin

set path (dirname (realpath ~/.config/fish/config.fish))

source $path/includes/global.fish
source $path/includes/fzf.fish
source $path/includes/abbr.fish
source $path/includes/alias.fish
# source $path/includes/yz.fish

if test -f $path/includes/private-vars.fish
  source $path/includes/private-vars.fish
end

# pnpm
if string match -q "/Volumes*" $HOME
  set -gx PNPM_HOME "/Volumes/HomeX/kento/Library/pnpm"
else
  set -gx PNPM_HOME "/Users/kento/Library/pnpm"
end

if not string match -q -- $PNPM_HOME $PATH
  set -gx PATH "$PNPM_HOME" $PATH
end
# pnpm end

# Added by Windsurf
fish_add_path /Volumes/HomeX/kento/.codeium/windsurf/bin

alias claude="/Volumes/HomeX/kento/.config/claude/local/claude"
