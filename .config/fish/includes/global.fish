set -g fish_greeting
set -g fish_key_bindings fish_vi_key_bindings
set -g fish_color_autosuggestion a5adce
set -g fish_cursor_insert block
set -gx EDITOR nvim
set -gx VISUAL nvim
set -gx HOMEBREW_NO_AUTO_UPDATE 1
set -gx NIX_CONF_DIR $HOME/dotfiles/.config/nix-darwin

set -gx XDG_CONFIG_HOME $HOME/.config
set -gx XDG_DATA_HOME ~/.local/share
set -gx COINTOP_CONFIG $HOME/.config/cointop/config.toml
set -gx OLLAMA_HOST "127.0.0.1:11434"
