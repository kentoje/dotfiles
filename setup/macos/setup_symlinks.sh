#!/bin/bash

# .../dotfiles
PWD=$(pwd)
CLEANED_PATH="$(echo $PWD | sed 's/\(.*\)\/dotfiles.*/\1\/dotfiles/')"

if [ -f "$HOME/.config/starship.toml" ]; then
	rm "$HOME/.config/starship.toml"
fi

if [ -f "$HOME/.config/alacritty/alacritty.toml" ]; then
	rm "$HOME/.config/alacritty/alacritty.toml"
fi

if [ -f "$HOME/Library/Application Support/lazygit/config.yml" ]; then
	rm "$HOME/Library/Application Support/lazygit/config.yml"
fi

if [ -f "$HOME/Library/Application Support/name.guoc.SpaceLauncher/configuration.json" ]; then
	rm "$HOME/Library/Application Support/name.guoc.SpaceLauncher/configuration.json"
fi

if [ -f "$HOME/.config/tmux/gitmux.conf" ]; then
	rm "$HOME/.config/tmux/gitmux.conf"
fi

if [ -f "$HOME/.config/tmux/tmux.conf" ]; then
	rm "$HOME/.config/tmux/tmux.conf"
fi

if [ -f "$HOME/.yabairc" ]; then
	rm "$HOME/.yabairc"
fi

if [ -d "$HOME/.config/fish" ]; then
	rm -rf "$HOME/.config/fish"
fi

if [ -d "$HOME/.config/bat" ]; then
	rm -rf "$HOME/.config/bat"
fi

if [ -d "$HOME/.config/kitty" ]; then
	rm -rf "$HOME/.config/kitty"
fi

if [ -d "$HOME/.config/nvim" ]; then
	rm -rf "$HOME/.config/nvim"
fi

if [ -d "$HOME/.config/lf" ]; then
	rm -rf "$HOME/.config/lf"
fi

if [ -d "$HOME/.hammerspoon" ]; then
	rm -rf "$HOME/.hammerspoon"
fi

ln -s $CLEANED_PATH/starship.toml $HOME/.config/starship.toml
ln -s $CLEANED_PATH/lazygit/config.yml $HOME/Library/Application\ Support/lazygit/config.yml 
ln -s $CLEANED_PATH/spacelauncher2/configuration.json $HOME/Library/Application\ Support/name.guoc.SpaceLauncher/configuration.json 
ln -s $CLEANED_PATH/tmux/gitmux.conf $HOME/.config/tmux/gitmux.conf
ln -s $CLEANED_PATH/tmux/tmux.conf $HOME/.config/tmux/tmux.conf
ln -s $CLEANED_PATH/.yabairc $HOME/.yabairc
ln -s $CLEANED_PATH/fish $HOME/.config/fish
ln -s $CLEANED_PATH/bat $HOME/.config/bat
ln -s $CLEANED_PATH/kitty $HOME/.config/kitty
ln -s $CLEANED_PATH/nvim $HOME/.config/nvim
ln -s $CLEANED_PATH/lf $HOME/.config/lf
ln -s $CLEANED_PATH/alacritty $HOME/.config/alacritty
ln -s $CLEANED_PATH/hammerspoon $HOME/.hammerspoon

