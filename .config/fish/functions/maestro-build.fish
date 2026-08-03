function maestro-build -d "Rebuild the maestro CLI from source into ~/.local/bin"
    set -l repo /Volumes/HomeX/kento/Documents/github/kentoje/maestro
    go build -o $HOME/.local/bin/maestro $repo/cmd/maestro
    and ln -sf $repo/completions/maestro.fish $HOME/.config/fish/completions/maestro.fish
    and echo "maestro rebuilt →" (command -v maestro)
end
