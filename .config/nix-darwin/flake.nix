{
  description = "Darwin system flake (mac-mini + macbook-pro)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  # darwin-rebuild switch needs to be run as root. On the Mac mini I had to add
  # a /var/root/.gitconfig with `[safe] directory = <dotfiles path>` for the
  # activation to trust the repo (see `dr` fish function for the flake target).

  outputs =
    inputs@{
      self,
      nix-darwin,
      nixpkgs,
      ...
    }:
    let
      # Every host shares common.nix and adds its own hosts/<host>.nix.
      mkHost =
        hostModule:
        nix-darwin.lib.darwinSystem {
          specialArgs = { inherit self; };
          modules = [
            ./common.nix
            hostModule
          ];
        };
    in
    {
      # Build/switch with:
      #   $ darwin-rebuild switch --flake .#mac-mini
      #   $ darwin-rebuild switch --flake .#macbook-pro
      # (the `dr` fish function picks the right one by hostname).
      darwinConfigurations."mac-mini" = mkHost ./hosts/mac-mini.nix;
      darwinConfigurations."macbook-pro" = mkHost ./hosts/macbook-pro.nix;

      # Expose the package set, including overlays, for convenience.
      darwinPackages = self.darwinConfigurations."mac-mini".pkgs;
    };
}
