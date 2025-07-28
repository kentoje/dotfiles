function sync_claude_agents
    set -l source_dir ~/dotfiles/.config/claude/agents
    set -l target_dir ~/.claude/agents

    # Create ~/.claude directory if it doesn't exist
    if not test -d ~/.claude
        mkdir -p ~/.claude
        echo "Created ~/.claude directory"
    end

    # Remove existing symlink or directory if it exists
    if test -L $target_dir
        rm $target_dir
        echo "Removed existing symlink"
    else if test -d $target_dir
        echo "Warning: $target_dir exists as a directory, not a symlink"
        echo "Please remove it manually if you want to replace it with a symlink"
        return 1
    end

    # Create the symlink
    ln -s $source_dir $target_dir
    echo "Created symlink: $target_dir -> $source_dir"
end
