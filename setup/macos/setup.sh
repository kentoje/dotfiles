#!/bin/bash

# Will install brew
./brew/install.sh

# TODO: Find a way to share the brew path with all programs, global env would be a good idea.

# Needs some "homebrew" packages.
./applications_to_install/install.sh

./fish/setup_install_fisher_plugins.sh

./setup_symlinks.sh

# Needs to be run in sudo
sudo ./setup_scripting_addition.sh

# Install fzf ctrl + r mode
/usr/local/opt/fzf/install

./macos_config/install.sh

