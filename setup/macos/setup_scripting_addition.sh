#!/bin/bash

sudo echo "$(whoami) ALL=(root) NOPASSWD: sha256:$(shasum -a 256 $(which yabai) | awk '{print$1}') $(which yabai) --load-sa" > /private/etc/sudoers.d/yabai
sudo chmod 440 /private/etc/sudoers.d/yabai

