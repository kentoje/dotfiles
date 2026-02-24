function sync_agent_skills -d "Sync skills from .agents/skills to all AI tool config directories"
    set -l source_dir $HOME/dotfiles/.agents/skills

    if not test -d $source_dir
        echo "Error: Source directory $source_dir does not exist"
        return 1
    end

    argparse 'force' -- $argv

    echo "Syncing skills from $source_dir..."

    # Whole-directory symlink targets
    set -l target_dirs \
        $HOME/.claude/skills \
        $HOME/dotfiles/.config/opencode/skills \
        $HOME/dotfiles/.config/amp/skills \
        $HOME/dotfiles/.config/agents/skills

    set -l errors 0

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

        ln -s $source_dir $target_dir
        and echo "  Linked: $target_dir -> $source_dir"
    end

    # Per-skill symlinks for Codex (preserves its .system/ dir)
    set -l codex_skills_dir $HOME/.codex/skills
    if test -d (dirname $codex_skills_dir)
        mkdir -p $codex_skills_dir
        echo "  Syncing individual skills to $codex_skills_dir..."

        for skill_dir in $source_dir/*/
            set -l name (basename $skill_dir)
            set -l target $codex_skills_dir/$name

            if test -L $target
                rm $target
            else if test -d $target
                continue
            end

            ln -s $source_dir/$name $target
            and echo "    Linked: $name"
        end
    end

    if test $errors -gt 0
        echo "Done with $errors warning(s). Run with --force to replace real directories."
        return 1
    else
        echo "All skills synced!"
    end
end
