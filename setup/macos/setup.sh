#!/bin/bash

mkdir -p "$HOME/Pictures/screenshots"

# Add a nix command to setup
./setup_nix.sh

# Install fisher plugins
./fish/setup_install_fisher_plugins.sh

# Create symlinks
stow .

if [ ! -d "$HOME/Pictures/wallpapers" ]; then
  ./setup_pictures.sh
fi
