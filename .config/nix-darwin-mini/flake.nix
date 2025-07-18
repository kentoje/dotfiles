{
  description = "Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  # darwin-rebuild switch needs to be run as root now.
  # I had to add a /var/root/.gitconfig file to make it work.
  # ❯ sudo bat /var/root/.gitconfig
  # ───────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  #        │ File: /var/root/.gitconfig
  # ───────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  #    1   │ [safe]
  #    2   │     directory = /Volumes/HomeX/kento/dotfiles
  # ───────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

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
            # overlays = [];
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
            bat
            gnupg
            coreutils
            poppler-utils
            atuin
            btop
            cointop
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
            fastfetch
            ripgrep
            starship
            stow
            tmux
            tree
            tldr
            nodePackages.yalc
            bun
            yq
            zoxide
            gitmux
            yazi
            chafa
          ];

          system.defaults = {
            ".GlobalPreferences"."com.apple.mouse.scaling" = -1.0;
            screencapture.location = "/Volumes/HomeX/kento/Pictures/screenshots";
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

          # Trick because of custom mount volume.
          # Note: postUserActivation is no longer available, using system.activationScripts instead
          system.activationScripts.extraActivation.text = ''
            echo "Running post-activation script for LaunchAgents..." >&2
            # This ensures this script runs after user setup
            if [ ! -d /Users/kento/Library/LaunchAgents ]; then
              echo "Creating LaunchAgents directory..." >&2
              sudo -u kento mkdir -p /Users/kento/Library/LaunchAgents
            fi

            if [ ! -f /Users/kento/Library/LaunchAgents/org.nixos.sketchybar.plist ]; then
              sudo -u kento cp /Volumes/HomeX/kento/Library/LaunchAgents/org.nixos.sketchybar.plist /Users/kento/Library/LaunchAgents/org.nixos.sketchybar.plist
            fi

            if [ ! -f /Users/kento/Library/LaunchAgents/org.nixos.svim.plist ]; then
              sudo -u kento cp /Volumes/HomeX/kento/Library/LaunchAgents/org.nixos.svim.plist /Users/kento/Library/LaunchAgents/org.nixos.svim.plist
            fi

            # Check and restart sketchybar service
            if sudo -u kento launchctl print "gui/$(id -u kento)/org.nixos.sketchybar" >/dev/null 2>&1; then
              echo "Stopping existing sketchybar service..." >&2
              sudo -u kento launchctl bootout "gui/$(id -u kento)" /Users/kento/Library/LaunchAgents/org.nixos.sketchybar.plist
            fi
            echo "Starting sketchybar service..." >&2
            sudo -u kento launchctl bootstrap "gui/$(id -u kento)" /Users/kento/Library/LaunchAgents/org.nixos.sketchybar.plist

            # Check and restart svim service
            if sudo -u kento launchctl print "gui/$(id -u kento)/org.nixos.svim" >/dev/null 2>&1; then
              echo "Stopping existing svim service..." >&2
              sudo -u kento launchctl bootout "gui/$(id -u kento)" /Users/kento/Library/LaunchAgents/org.nixos.svim.plist
            fi
            echo "Starting svim service..." >&2
            sudo -u kento launchctl bootstrap "gui/$(id -u kento)" /Users/kento/Library/LaunchAgents/org.nixos.svim.plist
          '';
          #   sf-mono-liga-bin  # Your custom font from the overlay
          #   (nerdfonts.override { fonts = [ "JetBrainsMono" "FiraCode" ]; })
          # ];

          # fonts = {
          #   fonts = with pkgs; [ sf-mono-liga-bin ];
          # };

          # Auto upgrade nix package and the daemon service.
          # services.nix-daemon.enable = true;  # No longer needed
          # nix.package = pkgs.nix;

          # Launch sketchybar on login
          launchd.user.agents = {
            sketchybar = {
              serviceConfig = {
                RunAtLoad = true;
                KeepAlive = true;
                ProcessType = "Interactive";
                StandardOutPath = "/tmp/sketchybar.out.log";
                StandardErrorPath = "/tmp/sketchybar.err.log";
                EnvironmentVariables = {
                  PATH = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
                };
              };
              # Not sure how to avoid waiting, and have some sort of dependencies.
              script = ''
                if [ ! -f $HOME/Library/Fonts/sketchybar-app-font.ttf ] ; then
                  cp $HOME/dotfiles/assets/fonts/sketchybar-app-font.ttf $HOME/Library/Fonts
                fi

                # Wait for font-hack-nerd-font to be installed (cask)
                while [ ! -f "/Library/Fonts/SF-Pro.ttf" ]; do
                  echo "Waiting for font to be installed..." >> /tmp/sketchybar.out.log
                  sleep 1
                done

                # Give the system a moment to register the font
                sleep 2

                /opt/homebrew/bin/sketchybar
              '';
            };

            svim = {
              serviceConfig = {
                RunAtLoad = true;
                KeepAlive = true;
                ProcessType = "Interactive";
                StandardOutPath = "/tmp/svim.out.log";
                StandardErrorPath = "/tmp/svim.err.log";
                EnvironmentVariables = {
                  PATH = "/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";
                };
              };
              script = ''
                /opt/homebrew/bin/svim
              '';
            };
          };

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
            home = "/Volumes/HomeX/kento";
          };

          # Set the primary user for nix-darwin
          system.primaryUser = "kento";

          # nix.configureBuildUsers = true;  # No longer needed
          # nix.useDaemon = true;  # No longer needed
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
