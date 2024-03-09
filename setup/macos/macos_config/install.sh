#!/bin/bash

echo "🍎 - Setting up apple configuration!"

# Mouse behaviour
defaults write .GlobalPreferences com.apple.mouse.scaling -1

# App behaviour
# defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false
# defaults write me.lukehaas.runjs ApplePressAndHoldEnabled -bool false

# Typing behaviour
defaults write -g KeyRepeat -int 1
defaults write -g InitialKeyRepeat -int 10

echo "ℹ️ - You will need to restart the computer in order to apply changes."

