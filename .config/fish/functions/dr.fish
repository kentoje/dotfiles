function dr
    # One flake, two host configs sharing common.nix. Select by MACHINE, not
    # $HOME: mac-mini => .#mac-mini, everything else (the MacBook Pro) => .#macbook-pro.
    set -l flake ~/dotfiles/.config/nix-darwin
    if string match -qi "*mac-mini*" (scutil --get LocalHostName)
        sudo darwin-rebuild switch --flake $flake#mac-mini
    else
        sudo darwin-rebuild switch --flake $flake#macbook-pro
    end
end

