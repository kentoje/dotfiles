#!/bin/bash

# Check if I don't have nix installed, then install it

if ! [ -x "$(command -v nix)" ]; then
  echo "Installing nix..." >&2
  curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install

  # Starts the daemon
  . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
fi


# Select the host config by MACHINE (matches the `dr` fish function).
FLAKE="$HOME/dotfiles/.config/nix-darwin"
if [[ "$(scutil --get LocalHostName)" == *[Mm]ac-mini* ]]; then
    echo "Using mac-mini configuration..." >&2
    nix run nix-darwin -- switch --flake "$FLAKE#mac-mini"
else
    echo "Using macbook-pro configuration..." >&2
    nix run nix-darwin -- switch --flake "$FLAKE#macbook-pro"
fi
