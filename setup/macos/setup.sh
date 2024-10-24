#!/bin/bash

# Add a nix command to setup
./setup_nix.sh

# Needs some "homebrew" packages.
./applications_to_install/install.sh

./fish/setup_install_fisher_plugins.sh

./setup_symlinks.sh

# Install fzf ctrl + r mode
# /usr/local/opt/fzf/install
