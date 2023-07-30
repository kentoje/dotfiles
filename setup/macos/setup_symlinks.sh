#!/bin/bash

PWD=$(pwd)
# .../dotfiles
CLEANED_PATH="$(echo "$PWD" | sed 's/\/setup\/macos//')"

if [ -f "$HOME/.config/starship.toml" ]; then
	echo "st"
	rm "$HOME/.config/starship.toml"
fi

if [ -f "$HOME/.config/tmux/gitmux.conf" ]; then
	echo "gitm"
	rm "$HOME/.config/tmux/gitmux.conf"
fi

if [ -f "$HOME/.config/tmux/tmux.conf" ]; then
	echo "tmux"
	rm "$HOME/.config/tmux/tmux.conf"
fi

ln -s $CLEANED_PATH/starship.toml $HOME/.config/starship.toml
ln -s $CLEANED_PATH/tmux/gitmux.conf $HOME/.config/tmux/gitmux.conf
ln -s $CLEANED_PATH/tmux/tmux.conf $HOME/.config/tmux/tmux.conf

