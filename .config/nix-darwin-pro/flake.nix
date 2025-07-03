{
  description = "Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs@{
      self,
      nix-darwin,
      nixpkgs,
      ...
    }:
    let
      configuration =
        { pkgs, config, ... }:
        {
          nixpkgs = {
            config.allowUnfree = true;
          };

          # List packages installed in system profile. To search by name, run:
          # $ nix-env -qaP | grep wget
          environment.systemPackages = with pkgs; [
            # GUI Apps
            # arc-browser
            # spotify
            # raycast
            # shortcat
            # insomnia
            # keycastr
            # obsidian

            # CLI tools
            neovim
            mkalias
            bun
            bat
            gnupg
            coreutils
            gawk
            atuin
            btop
            imagemagick
            wget
            sad
            ffmpeg
            entr
            fish
            nixfmt-rfc-style
            fd
            fnm
            fzf
            delta
            go
            gnugrep
            jq
            lazygit
            lsd
            gum
            mods
            glow
            # lua and co...
            fastfetch
            ripgrep
            starship
            stow
            tmux
            zellij
            tree
            tldr
            typescript
            yq
            nodePackages.yalc
            zoxide
            gitmux
            prettierd
            qmk
            yazi
            chafa
          ];

          system.defaults = {
            ".GlobalPreferences"."com.apple.mouse.scaling" = -1.0;
            screencapture.location = "/Users/kento/Pictures/screenshots";
            dock.autohide = true;
            dock.orientation = "left";
            finder.FXPreferredViewStyle = "clmv";
            loginwindow.GuestEnabled = false;
            NSGlobalDomain.AppleICUForce24HourTime = true;
            NSGlobalDomain.KeyRepeat = 1;
            NSGlobalDomain.InitialKeyRepeat = 10;
            NSGlobalDomain."com.apple.swipescrolldirection" = false;
            NSGlobalDomain._HIHideMenuBar = true;
            NSGlobalDomain.AppleInterfaceStyle = "Dark";
            NSGlobalDomain.AppleShowAllExtensions = true;
            universalaccess.reduceMotion = true;
            NSGlobalDomain.AppleShowAllFiles = true;
            NSGlobalDomain.NSWindowResizeTime = 0.1;
          };

          system.keyboard = {
            enableKeyMapping = true;
            remapCapsLockToEscape = true;
          };

          system.activationScripts.applications.text =
            let
              env = pkgs.buildEnv {
                name = "system-applications";
                paths = config.environment.systemPackages;
                pathsToLink = "/Applications";
              };
            in
            pkgs.lib.mkForce ''
              # Set up applications.
              echo "setting up /Applications..." >&2
              rm -rf /Applications/Nix\ Apps
              mkdir -p /Applications/Nix\ Apps
              find ${env}/Applications -maxdepth 1 -type l -exec readlink '{}' + |
              while read -r src; do
                app_name=$(basename "$src")
                echo "copying $src" >&2
                ${pkgs.mkalias}/bin/mkalias "$src" "/Applications/Nix Apps/$app_name"
              done
            '';

          nix.settings.experimental-features = "nix-command flakes";

          # Determinate uses its own daemon to manage the Nix installation that
          # conflicts with nix-darwin’s native Nix management.
          #
          # To turn off nix-darwin’s management of the Nix installation, set:
          #
          #     nix.enable = false;
          #
          # This will allow you to use nix-darwin with Determinate. Some nix-darwin
          # functionality that relies on managing the Nix installation, like the
          # `nix.*` options to adjust Nix settings or configure a Linux builder,
          # will be unavailable.
          nix.enable = false;

          system.configurationRevision = self.rev or self.dirtyRev or null;
          system.stateVersion = 5;
          nixpkgs.hostPlatform = "aarch64-darwin";
          system.primaryUser = "kento";
          users.users.kento = {
            home = "/Users/kento";
          };
        };
    in
    {
      # Build darwin flake using:
      # $ darwin-rebuild build --flake .#simple
      darwinConfigurations."kento" = nix-darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        modules = [
          configuration
        ];
      };

      # Expose the package set, including overlays, for convenience.
      darwinPackages = self.darwinConfigurations."kento".pkgs;
    };
}
