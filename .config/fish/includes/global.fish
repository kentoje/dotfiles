set -U fish_greeting
set -U fish_key_bindings fish_vi_key_bindings
set -U fish_color_autosuggestion a5adce
set fish_cursor_insert block
set -gx EDITOR nvim
set -Ux VISUAL nvim
set -Ux HOMEBREW_NO_AUTO_UPDATE 1
set -Ux NIX_CONF_DIR $HOME/dotfiles/.config/nix-darwin

set -Ux XDG_CONFIG_HOME $HOME/.config
set -Ux XDG_DATA_HOME ~/.local/share
set -Ux COINTOP_CONFIG $HOME/.config/cointop/config.toml
set -Ux OLLAMA_HOST "127.0.0.1:11434"
