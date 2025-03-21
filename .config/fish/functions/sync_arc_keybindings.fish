function sync_arc_keybindings
    set -l arc_keybindings_path "$HOME/Library/Application Support/Arc/StorableKeyBindings.json"
    set -l dotfiles_keybindings "$HOME/dotfiles/.config/arc/StorableKeyBindings.json"

    if not test -f "$dotfiles_keybindings"
        echo "❌ Error: Dotfiles keybindings file does not exist at: $dotfiles_keybindings"
        return 1
    end
    
    if test -f "$arc_keybindings_path"
        echo "Arc keybindings file found at: $arc_keybindings_path"

        rm "$arc_keybindings_path"
        echo "Removed original Arc keybindings file"
        
        ln -sf "$dotfiles_keybindings" "$arc_keybindings_path"
        echo "✅ Created symlink from $dotfiles_keybindings to $arc_keybindings_path"
    end
end

