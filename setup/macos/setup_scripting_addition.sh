#!/bin/bash

echo "🧰 Setting up scripting addition for yabai..."

# Store the user under a env var in global.
sudo echo "kento ALL=(root) NOPASSWD: sha256:$(shasum -a 256 $(which yabai) | awk '{print$1}') $(which yabai) --load-sa" > /private/etc/sudoers.d/yabai
sudo chmod 440 /private/etc/sudoers.d/yabai

