# Cargo
. "$HOME/.cargo/env"

# PATH setup
export PATH="$HOME/.opencode/bin:$PATH"
export PATH="$HOME/.codeium/windsurf/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.config/bin:$PATH"
export PATH="$HOME/.local/share/nvim/mason/bin:$PATH"
export PATH="$HOME/Library/pnpm:$PATH"

# fnm (Fast Node Manager)
eval "$(fnm env --use-on-cd --shell zsh)"
