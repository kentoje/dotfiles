#!/bin/bash

PWD=$(pwd)
# .../dotfiles
CLEANED_PATH="$(echo "$PWD" | sed 's/\/setup\/macos//')"

if [ ! -e "$HOME/.config/starship.toml" ]; then
	ln -s $CLEANED_PATH/.config/starship.toml $HOME/.config/starship.toml
fi

if [ ! -e "$HOME/.config/tmux/gitmux.conf" ]; then
	ln -s $CLEANED_PATH/tmux/gitmux.conf $HOME/.config/tmux/gitmux.conf
fi

if [ ! -e "$HOME/.config/tmux/tmux.conf" ]; then
	ln -s $CLEANED_PATH/tmux/tmux.conf $HOME/.config/tmux/tmux.conf
fi

