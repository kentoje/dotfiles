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
        # Note: OpenCode commands need format conversion, handled separately below
        set -l target_dirs \
            $HOME/.claude/$subdir \
            $HOME/dotfiles/.config/amp/$subdir \
            $HOME/dotfiles/.config/agents/$subdir

        # OpenCode supports skills via symlink (same SKILL.md format)
        if test "$subdir" = skills
            set -a target_dirs $HOME/dotfiles/.config/opencode/$subdir
        end

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

    # Generate OpenCode commands from AGENTS.md files
    # OpenCode expects commands/<name>.md with description in frontmatter
    # Claude Code uses commands/<name>/AGENTS.md with name + description
    set -l oc_cmd_dir $HOME/dotfiles/.config/opencode/commands
    set -l cmd_source $agents_dir/commands

    if test -d $cmd_source
        mkdir -p $oc_cmd_dir
        echo "Generating OpenCode commands from AGENTS.md..."

        for cmd_dir in $cmd_source/*/
            set -l name (basename $cmd_dir)
            set -l agents_file $cmd_dir/AGENTS.md

            if not test -f $agents_file
                continue
            end

            # Convert: strip `name:` line, keep everything else
            sed '/^name:.*$/d' $agents_file >$oc_cmd_dir/$name.md
            and echo "  Generated: $oc_cmd_dir/$name.md"
        end
    end

    if test $errors -gt 0
        echo "Done with $errors warning(s). Run with --force to replace real directories."
        return 1
    else
        echo "All agents synced!"
    end
end
