#!/bin/bash

# .../dotfiles
PWD=$(pwd)
CLEANED_PATH="$(echo $PWD | sed 's/\(.*\)\/dotfiles.*/\1\/dotfiles/')"

# Check if I don't have nix installed, then install it

if ! [ -x "$(command -v git)" ]; then
  echo "Installing nix..." >&2
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
fi

nix run nix-darwin -- switch --flake "$CLEANED_PATH/.config/nix-darwin/#kento"

# Might want change the owner of the fish folder, if I don't find a workaround.
