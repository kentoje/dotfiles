# Mac mini: the desktop workstation. Runs the sketchybar + agent-gossips
# launchd services and carries embedded/hardware tooling. Nix is managed by
# nix-darwin here (no Determinate).
{ pkgs, ... }:
{
  environment.systemPackages = with pkgs; [
    poppler-utils
    cointop
    wireguard-tools
    jira-cli-go
    gcc-arm-embedded
    gh
    potrace
    p7zip
    qemu
    nmap
  ];

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

    agent-gossips = {
      serviceConfig = {
        RunAtLoad = true;
        KeepAlive = true;
        WorkingDirectory = "/Users/kento/Documents/github/kentoje/agent-gossips";
        StandardOutPath = "/tmp/agent-gossips.out.log";
        StandardErrorPath = "/tmp/agent-gossips.err.log";
        EnvironmentVariables = {
          PATH = "/run/current-system/sw/bin:/usr/bin:/bin";
        };
      };
      script = ''
        /Users/kento/.bun/bin/bun run src/index.ts
      '';
    };

    agent-gossips-daemon = {
      serviceConfig = {
        RunAtLoad = true;
        KeepAlive = true;
        StandardOutPath = "/tmp/agent-gossips-daemon.out.log";
        StandardErrorPath = "/tmp/agent-gossips-daemon.err.log";
        EnvironmentVariables = {
          PATH = "/opt/homebrew/bin:/run/current-system/sw/bin:/usr/bin:/bin";
        };
      };
      script = ''
        # Wait for agent-gossips server to be ready
        until curl -sf http://localhost:4000/health >/dev/null 2>&1; do
          sleep 1
        done
        exec /Users/kento/dotfiles/.config/sketchybar/scripts/agent-gossips-daemon.sh
      '';
    };
  };
}
