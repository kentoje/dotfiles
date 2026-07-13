# MacBook Pro: the leaner laptop. JS/TS-oriented toolchain, no launchd
# services. Nix is managed by Determinate, so nix-darwin's own Nix management
# is disabled.
{ pkgs, ... }:
{
  environment.systemPackages = with pkgs; [
    bun
    gawk
    lua
    typescript
    prettierd
  ];

  # Determinate uses its own daemon to manage the Nix installation that
  # conflicts with nix-darwin's native Nix management.
  #
  # To turn off nix-darwin's management of the Nix installation, set:
  #
  #     nix.enable = false;
  #
  # This will allow you to use nix-darwin with Determinate. Some nix-darwin
  # functionality that relies on managing the Nix installation, like the
  # `nix.*` options to adjust Nix settings or configure a Linux builder,
  # will be unavailable.
  nix.enable = false;
}
