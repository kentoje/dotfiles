#!/bin/bash

PWD=$(pwd)
CLEANED_PATH="$(echo $PWD | sed 's/\(.*\)\/dotfiles.*/\1\/dotfiles/')"

fish -c "fisher install (cat $CLEANED_PATH/fish/fish_plugins)"

