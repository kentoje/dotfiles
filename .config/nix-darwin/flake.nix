{
  description = "Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    nix-homebrew.url = "github:zhaofengli-wip/nix-homebrew";

    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs, nix-homebrew, home-manager, ... }:
  let
    configuration = { pkgs, config, ... }: {
      nixpkgs.config.allowUnfree = true;

      # List packages installed in system profile. To search by name, run:
      # $ nix-env -qaP | grep wget
      environment.systemPackages = with pkgs;
        [
          # GUI Apps
          # alacritty
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
          awscli
          bat
          procps
          gnupg
          coreutils
          gawk
          btop
          wget
          sad
          ffmpeg
          entr
          fish
          fd
          fnm
          fzf
          delta
          go
          gnugrep
          jq
          lazygit
          lf
          lsd
          gum
          mods
          glow
          # lua and co...
          neofetch
          ripgrep
          rustc
          starship
          stow
          pnpm
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
        ];

      homebrew = {
        enable = true;
        brews = [
          "mas"
        ];
        casks = [
          # "hammerspoon"
          # "spacelauncher"
          # "logitech-options"
          "nikitabobko/tap/aerospace"
          "karabiner-elements"
        ];
        # Make sure to be logged in App Store.
        # masApps = {
        #   "Tayasui" = 1178074963;
        #   "Spark" = 1176895641;
        # };
        # onActivation.cleanup = "zap";
        onActivation.autoUpdate = true;
        onActivation.upgrade = true;
      };

      system.defaults = {
        ".GlobalPreferences"."com.apple.mouse.scaling" = -1.0;
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

      system.activationScripts.applications.text = let
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
        while read src; do
          app_name=$(basename "$src")
          echo "copying $src" >&2
          ${pkgs.mkalias}/bin/mkalias "$src" "/Applications/Nix Apps/$app_name"
        done
      '';

      # fonts.packages = [];

      # Auto upgrade nix package and the daemon service.
      services.nix-daemon.enable = true;
      # nix.package = pkgs.nix;

      # Necessary for using flakes on this system.
      nix.settings.experimental-features = "nix-command flakes";

      # Create /etc/zshrc that loads the nix-darwin environment.
      # programs.zsh.enable = true;  # default shell on catalina
      # programs.fish.enable = true;

      # Set Git commit hash for darwin-version.
      system.configurationRevision = self.rev or self.dirtyRev or null;

      # Used for backwards compatibility, please read the changelog before changing.
      # $ darwin-rebuild changelog
      system.stateVersion = 5;

      # The platform the configuration will be used on.
      nixpkgs.hostPlatform = "aarch64-darwin";

      users.users.kento = {
        home = "/Users/kento";
      };

      nix.configureBuildUsers = true;
      nix.useDaemon = true;
    };
  in
  {
    # Build darwin flake using:
    # $ darwin-rebuild build --flake .#simple
    darwinConfigurations."kento" = nix-darwin.lib.darwinSystem {
      system = "aarch64-darwin";
      modules = [
        configuration

        nix-homebrew.darwinModules.nix-homebrew
        {
          nix-homebrew = {
            # Install Homebrew under the default prefix
            enable = true;

            # Apple Silicon Only: Also install Homebrew under the default Intel prefix for Rosetta 2
            enableRosetta = true;

            # User owning the Homebrew prefix
            user = "kento";

            # Optional: Enable fully-declarative tap management
            #
            # With mutableTaps disabled, taps can no longer be added imperatively with `brew tap`.
            # mutableTaps = false;
          };
        }

        home-manager.darwinModules.home-manager
        {
          home-manager.useGlobalPkgs = true;
          home-manager.useUserPackages = true;
          home-manager.users.kento = import ./home.nix;

          home-manager.extraSpecialArgs = {
            inherit inputs;
          };
          # Optionally, use home-manager.extraSpecialArgs to pass
          # arguments to home.nix
        }
      ];
    };

    # Expose the package set, including overlays, for convenience.
    darwinPackages = self.darwinConfigurations."kento".pkgs;
  };
}
