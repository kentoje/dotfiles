function dr
    # Select the flake by MACHINE, not $HOME. The old "/Volumes* => mini" heuristic
    # identified this Mac mini by its external home; after migrating to a /Users home
    # that misfires and builds the MacBook Pro config here. mini = Mac mini, pro = MBP.
    if string match -qi "*mac-mini*" (scutil --get LocalHostName)
        sudo darwin-rebuild switch --flake ~/dotfiles/.config/nix-darwin-mini/#kento
    else
        sudo darwin-rebuild switch --flake ~/dotfiles/.config/nix-darwin-pro/#kento
    end
end

