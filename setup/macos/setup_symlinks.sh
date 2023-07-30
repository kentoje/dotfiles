#!/bin/bash

PWD=$(pwd)
CLEANED_PATH="$(echo "$PWD" | sed 's/\/setup\/macos//')"

ln -s $CLEANED_PATH/.config/starship.toml $HOME/.config/starship.toml

