#!/bin/bash

# .../dotfiles
PWD=$(pwd)
CLEANED_PATH="$(echo $PWD | sed 's/\(.*\)\/dotfiles.*/\1\/dotfiles/')"

if [ -f "$HOME/Library/Application Support/name.guoc.SpaceLauncher/configuration.json" ]; then
  rm "$HOME/Library/Application Support/name.guoc.SpaceLauncher/configuration.json"
fi

ln -s $CLEANED_PATH/spacelauncher2/configuration.json $HOME/Library/Application\ Support/name.guoc.SpaceLauncher/configuration.json
