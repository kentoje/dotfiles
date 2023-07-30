#!/bin/bash

# /usr/local/bin is the old way, /opt/homebrew/bin is the new way.
if [ -z "$(find /usr/local/bin -name "brew")" ] && [ -z "$(find /opt/homebrew/bin -name "brew")" ]; then
    # Install "homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo "🍺 - Installing brew packages!"
brew bundle install --file=Brewfile

