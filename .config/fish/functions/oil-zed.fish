function oil-zed --description 'Launch Oil.nvim with Zed integration using minimal config'
    # Default to current directory if no argument provided
    set -l dir .
    if set -q argv[1]
        set dir $argv[1]
    end

    # Resolve to absolute path
    set dir (realpath $dir)

    # Check if directory exists
    if not test -d $dir
        echo "Error: Directory '$dir' does not exist" >&2
        return 1
    end

    # Use minimal nvim config to avoid plugin conflicts
    set -l oil_minimal_dir "$HOME/dotfiles/.config/nvim/lua/plugins-zed"

    # Check if minimal config exists
    if not test -f "$oil_minimal_dir/oil-zed.lua"
        echo "Error: Minimal Oil.nvim configuration not found at $oil_minimal_dir" >&2
        echo "Run 'home-manager switch' to ensure the minimal config is installed" >&2
        return 1
    end

    # Launch Neovim with minimal config and Zed integration
    cd $dir
    exec nvim \
        --cmd "set noswapfile" \
        -u "$oil_minimal_dir/oil-zed.lua" \
        -c "lua vim.g.oil_open_in_zed = true" \
        -c "lua require('oil').open()" \
        -c "autocmd FileType oil nnoremap <buffer><silent> q :qa!<CR>" \
        -c "autocmd FileType oil nnoremap <buffer><silent> <Esc> :qa!<CR>"
end
