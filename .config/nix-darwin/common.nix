# Shared base for every host. Machine-specific packages/services live in
# hosts/<host>.nix, which imports this module. `self` is threaded in via
# specialArgs (see flake.nix) so we can stamp the configuration revision.
{ pkgs, config, self, ... }:
{
  nixpkgs = {
    config.allowUnfree = true;
    # overlays = [];
  };

  # Packages every machine gets. To search by name, run:
  # $ nix-env -qaP | grep wget
  environment.systemPackages = with pkgs; [
    # CLI tools
    neovim
    mkalias
    bat
    gnupg
    coreutils
    atuin
    btop
    imagemagick
    wget
    sad
    csvq
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
    yq
    nodePackages.yalc
    zoxide
    gitmux
    qmk
    diffnav
    yazi
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

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = "nix-command flakes";

  # Set Git commit hash for darwin-version.
  system.configurationRevision = self.rev or self.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 5;

  # The platform the configuration will be used on.
  nixpkgs.hostPlatform = "aarch64-darwin";

  system.primaryUser = "kento";

  users.users.kento = {
    home = "/Users/kento";
  };
}
