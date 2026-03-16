function sync_brew -d "Sync homebrew packages to match defined lists"
    argparse 'd/dry-run' 'u/update' -- $argv; or return

    set -l dry_run 0
    if set -q _flag_dry_run
        set dry_run 1
        echo "🔍 DRY RUN: No changes will be made."
        echo ""
    end

    # Define the desired packages
    set -l desired_taps \
        zfdang/free-for-macos \
        hashicorp/tap \
        felixkratz/formulae \
        nikitabobko/tap \
        charmbracelet/tap \
        shaunsingh/sfmono-nerd-font-ligaturized

    set -l desired_casks \
        drawpen \
        hammerspoon \
        font-commit-mono-nerd-font \
        font-hack-nerd-font \
        font-sf-pro \
        sf-symbols \
        aerospace \
        karabiner-elements \
        keycastr \
        font-sf-mono-nerd-font-ligaturized \
        ngrok

    set -l desired_brews \
        mas \
        sketchybar \
        ifstat \
        free-for-macos \
        glab \
        croc \
        cloc \
        crush \
        terraform

    echo "🍺 Starting homebrew sync..."

    # Check if brew is installed
    if not command -v brew >/dev/null 2>&1
        echo "❌ Homebrew is not installed. Please install it first."
        return 1
    end

    # Optionally update brew first
    if set -q _flag_update
        echo "📡 Updating homebrew..."
        if test $dry_run -eq 0
            brew update; or echo "⚠️  brew update failed, continuing anyway..."
        end
    end

    set -l errors

    # Gather current state upfront
    echo "📊 Gathering current state..."
    set -l current_taps (brew tap)
    set -l current_casks (brew list --cask)
    set -l current_brews (brew list --formula)
    set -l leaf_brews (brew leaves)

    # --- Phase 1: Install missing packages ---

    echo ""
    echo "📋 Syncing taps..."
    for tap in $desired_taps
        if not contains $tap $current_taps
            echo "  ➕ Adding tap: $tap"
            if test $dry_run -eq 0
                brew tap $tap; or set -a errors "Failed to tap: $tap"
            end
        else
            echo "  ✅ $tap"
        end
    end

    echo ""
    echo "📦 Syncing casks..."
    for cask in $desired_casks
        if not contains $cask $current_casks
            echo "  ➕ Installing cask: $cask"
            if test $dry_run -eq 0
                brew install --cask $cask; or set -a errors "Failed to install cask: $cask"
            end
        else
            echo "  ✅ $cask"
        end
    end

    echo ""
    echo "🍺 Syncing brews..."
    for brew_pkg in $desired_brews
        if not contains $brew_pkg $current_brews
            echo "  ➕ Installing brew: $brew_pkg"
            if test $dry_run -eq 0
                brew install $brew_pkg; or set -a errors "Failed to install brew: $brew_pkg"
            end
        else
            echo "  ✅ $brew_pkg"
        end
    end

    # --- Phase 2: Compute removals ---

    # Re-query leaves after installs — new packages may have changed the dependency tree
    if test $dry_run -eq 0
        set leaf_brews (brew leaves)
    end

    set -l taps_to_remove
    for tap in $current_taps
        if not contains $tap $desired_taps
            if not string match -q "homebrew/*" $tap
                set -a taps_to_remove $tap
            end
        end
    end

    set -l casks_to_remove
    for cask in $current_casks
        if not contains $cask $desired_casks
            set -a casks_to_remove $cask
        end
    end

    # Use brew leaves (top-level only) to avoid removing dependencies
    # brew leaves returns fully-qualified names for tapped formulae (e.g. tap/repo/pkg)
    # so we compare using the short name (last segment)
    set -l brews_to_remove
    for brew_pkg in $leaf_brews
        set -l short_name (string replace -r '.+/' '' $brew_pkg)
        if not contains $short_name $desired_brews
            set -a brews_to_remove $brew_pkg
        end
    end

    set -l has_removals 0
    if test (count $brews_to_remove) -gt 0; or test (count $casks_to_remove) -gt 0; or test (count $taps_to_remove) -gt 0
        set has_removals 1
    end

    # --- Phase 3: Confirm and execute removals ---

    echo ""
    if test $has_removals -eq 1
        echo "🗑️  Planned removals:"
        for pkg in $brews_to_remove
            echo "  ➖ brew: $pkg"
        end
        for pkg in $casks_to_remove
            echo "  ➖ cask: $pkg"
        end
        for tap in $taps_to_remove
            echo "  ➖ tap: $tap"
        end
        echo ""

        if test $dry_run -eq 1
            echo "🔍 DRY RUN complete. No changes were made."
            return 0
        end

        read -l -P "Proceed with removals? [y/N] " confirm
        if string match -qi "y" $confirm
            # Remove brews first (while tap info is still available)
            for brew_pkg in $brews_to_remove
                echo "  ➖ Removing brew: $brew_pkg"
                brew uninstall $brew_pkg; or set -a errors "Failed to uninstall brew: $brew_pkg"
            end

            for cask in $casks_to_remove
                echo "  ➖ Removing cask: $cask"
                brew uninstall --cask $cask; or set -a errors "Failed to uninstall cask: $cask"
            end

            # Remove taps last
            for tap in $taps_to_remove
                echo "  ➖ Removing tap: $tap"
                brew untap $tap; or set -a errors "Failed to untap: $tap"
            end
        else
            echo "⏭️  Removals skipped."
        end
    else
        echo "✅ Nothing to remove."
        if test $dry_run -eq 1
            echo "🔍 DRY RUN complete. No changes were made."
            return 0
        end
    end

    # --- Phase 4: Cleanup ---

    echo ""
    echo "🧹 Cleaning up..."
    brew autoremove; or set -a errors "Failed to run brew autoremove"
    brew cleanup; or set -a errors "Failed to run brew cleanup"

    # --- Summary ---

    echo ""
    if test (count $errors) -gt 0
        echo "⚠️  Completed with errors:"
        for err in $errors
            echo "  ❌ $err"
        end
        return 1
    end

    echo "✨ Homebrew sync complete!"
end
