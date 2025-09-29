function sync_claude_settings
    set -l source_file ~/dotfiles/.config/claude/settings.json
    set -l target_file ~/.claude/settings.json

    # Create ~/.claude directory if it doesn't exist
    if not test -d ~/.claude
        mkdir -p ~/.claude
        echo "Created ~/.claude directory"
    end

    # Check if source file exists
    if not test -f $source_file
        echo "Error: Source file $source_file does not exist"
        return 1
    end

    # Symlink the settings file
    ln -sf $source_file $target_file
    echo "Synced Claude settings: $source_file -> $target_file"

    # Symlink the statusline script
    ln -sf ~/dotfiles/.config/claude/statusline.sh ~/.claude/statusline.sh
end
