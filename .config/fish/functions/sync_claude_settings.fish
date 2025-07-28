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

    # Copy the settings file
    cp $source_file $target_file
    echo "Synced Claude settings: $source_file -> $target_file"
end