function dr
    if string match -q "/Volumes*" $HOME
        darwin-rebuild switch --flake ~/dotfiles/.config/nix-darwin-mini/#kento
    else
        darwin-rebuild switch --flake ~/dotfiles/.config/nix-darwin-pro/#kento
    end
end
