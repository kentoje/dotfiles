#!/bin/bash

# Will install brew
./brew/install.sh

# Needs some "homebrew" packages.
./applications_to_install/install.sh

./fish/setup_install_fisher_plugins.sh

# Needs VSCode and RunJS apps.
 ./macos_config/install.sh
