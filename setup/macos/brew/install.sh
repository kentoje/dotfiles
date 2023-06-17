#!/bin/bash

if [ -z "$(find /usr/local/bin -name "brew")" ] && [ -z "$(find /opt/homebrew/bin -name "brew")" ]; then
    # Install "homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

echo "🍺 - Installing brew packages!"
brew install "$(cat packages.txt)"
