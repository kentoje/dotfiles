#!/bin/bash

# Check if I don't have nix installed, then install it

if ! [ -x "$(command -v nix)" ]; then
  echo "Installing nix..." >&2
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
fi

nix run nix-darwin -- switch --flake "$HOME/dotfiles/.config/nix-darwin/#kento"
