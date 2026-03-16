function sync_brew -d "Sync homebrew packages to match defined lists"
    # Define the desired packages (extracted from your nix config)
    set -l desired_taps \
        zfdang/free-for-macOS \
        hashicorp/tap \
        FelixKratz/formulae \
        nikitabobko/tap \
        charmbracelet/tap \
        shaunsingh/SFMono-Nerd-Font-Ligaturized

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
        font-sf-mono-nerd-font-ligaturized

    set -l desired_brews \
        mas \
        sketchybar \
        ifstat \
        free-for-macos \
        glab \
        ngrok \
        croc \
        cloc \
        crush \
        diffnav \
        terraform

    echo "🍺 Starting homebrew sync..."

    # Check if brew is installed
    if not command -v brew >/dev/null 2>&1
        echo "❌ Homebrew is not installed. Please install it first."
        return 1
    end

    # Sync taps
    echo "📋 Syncing taps..."
    set -l current_taps (brew tap)

    # Install missing taps
    for tap in $desired_taps
        if not contains $tap $current_taps
            echo "➕ Adding tap: $tap"
            brew tap $tap
        else
            echo "✅ Tap already exists: $tap"
        end
    end

    # Remove extra taps (excluding core taps)
    for tap in $current_taps
        if not contains $tap $desired_taps
            # Don't remove core homebrew taps
            if not string match -q "homebrew/*" $tap
                echo "➖ Removing extra tap: $tap"
                brew untap $tap
            end
        end
    end

    # Sync casks
    echo "📦 Syncing casks..."
    set -l current_casks (brew list --cask)

    # Install missing casks
    for cask in $desired_casks
        if not contains $cask $current_casks
            echo "➕ Installing cask: $cask"
            brew install --cask $cask
        else
            echo "✅ Cask already installed: $cask"
        end
    end

    # Remove extra casks
    for cask in $current_casks
        if not contains $cask $desired_casks
            echo "➖ Removing extra cask: $cask"
            brew uninstall --cask $cask
        end
    end

    # Sync brews (formulae)
    echo "🍺 Syncing brews..."
    set -l current_brews (brew list --formula)

    # Install missing brews
    for brew_pkg in $desired_brews
        if not contains $brew_pkg $current_brews
            echo "➕ Installing brew: $brew_pkg"
            brew install $brew_pkg
        else
            echo "✅ Brew already installed: $brew_pkg"
        end
    end

    # Remove extra brews
    for brew_pkg in $current_brews
        if not contains $brew_pkg $desired_brews
            echo "➖ Removing extra brew: $brew_pkg"
            brew uninstall $brew_pkg
        end
    end

    # Cleanup
    echo "🧹 Cleaning up..."
    brew cleanup

    echo "✨ Homebrew sync complete!"
end
