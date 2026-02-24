function sync_agents_dir -d "Sync .agents/{skills,commands} to all AI tool config directories"
    set -l agents_dir $HOME/dotfiles/.agents

    if not test -d $agents_dir
        echo "Error: Source directory $agents_dir does not exist"
        return 1
    end

    argparse 'force' -- $argv

    set -l errors 0

    # Each subdirectory in .agents/ (skills, commands, etc.) gets synced
    for subdir in skills commands
        set -l source $agents_dir/$subdir

        if not test -d $source
            continue
        end

        echo "Syncing $subdir from $source..."

        # Whole-directory symlink targets
        set -l target_dirs \
            $HOME/.claude/$subdir \
            $HOME/dotfiles/.config/opencode/$subdir \
            $HOME/dotfiles/.config/amp/$subdir \
            $HOME/dotfiles/.config/agents/$subdir

        for target_dir in $target_dirs
            set -l parent_dir (dirname $target_dir)

            if not test -d $parent_dir
                mkdir -p $parent_dir
                echo "  Created $parent_dir"
            end

            if test -L $target_dir
                rm $target_dir
            else if test -d $target_dir
                if set -q _flag_force
                    rm -rf $target_dir
                    echo "  Removed directory: $target_dir"
                else
                    echo "  Warning: $target_dir is a real directory, use --force to replace"
                    set errors (math $errors + 1)
                    continue
                end
            end

            ln -s $source $target_dir
            and echo "  Linked: $target_dir -> $source"
        end

        # Per-item symlinks for Codex (preserves its .system/ dir)
        set -l codex_dir $HOME/.codex/$subdir
        if test -d (dirname $codex_dir)
            mkdir -p $codex_dir
            echo "  Syncing individual $subdir to $codex_dir..."

            for item_dir in $source/*/
                set -l name (basename $item_dir)
                set -l target $codex_dir/$name

                if test -L $target
                    rm $target
                else if test -d $target
                    continue
                end

                ln -s $source/$name $target
                and echo "    Linked: $name"
            end
        end
    end

    if test $errors -gt 0
        echo "Done with $errors warning(s). Run with --force to replace real directories."
        return 1
    else
        echo "All agents synced!"
    end
end
