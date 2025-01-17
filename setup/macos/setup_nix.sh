#!/bin/bash

# Check if I don't have nix installed, then install it

if ! [ -x "$(command -v nix)" ]; then
  echo "Installing nix..." >&2
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

  # Starts the daemon
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi


if [[ "$HOME" == */Volumes/* ]]; then
    echo "Using mini configuration for external drive..." >&2
    nix run nix-darwin -- switch --flake "$HOME/dotfiles/.config/nix-darwin-mini/#kento"
else
    echo "Using pro configuration for internal drive..." >&2
    nix run nix-darwin -- switch --flake "$HOME/dotfiles/.config/nix-darwin-pro/#kento"
fi
