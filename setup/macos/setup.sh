#!/bin/bash

mkdir -p "$HOME/Pictures/screenshots"

# Add a nix command to setup
./setup_nix.sh

# Install fisher plugins
./fish/setup_install_fisher_plugins.sh

# Install the pi custom harness deps (the `pih` abbr fails to boot without them)
"$(dirname "$0")/setup_pi_harness_deps.sh"

# Create symlinks
stow .

if [ ! -d "$HOME/Pictures/wallpapers" ]; then
  ./setup_pictures.sh
fi
