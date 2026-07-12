function claude-box -d "Run Claude Code in a nono sandbox scoped to the current git repo"
    # Sandbox model (see MIGRATION.md / nono claude-vol profile):
    #   - profile `claude-vol` denies blanket /Volumes reads (repos live on the
    #     external HomeX volume via ~/Documents, and nono otherwise grants all of
    #     /Volumes read).
    #   - we punch exactly ONE path back through that deny: the current repo root,
    #     granted read+write. Everything else on /Volumes (other repos, the old
    #     home duplicate, bulk) stays invisible to the agent.
    if not command -q nono
        echo "claude-box: nono is not installed (brew install nono)" >&2
        return 1
    end

    # Scope to the git repo root so it works from any subdirectory; fall back to cwd.
    set -l root (git rev-parse --show-toplevel 2>/dev/null)
    test -n "$root"; or set root (pwd)

    nono run \
        --profile claude-vol \
        --allow-cwd \
        --allow "$root" \
        --bypass-protection "$root" \
        -- claude $argv
end
