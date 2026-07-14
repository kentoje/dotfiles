function maestro-build -d "Rebuild the maestro CLI from source into ~/.local/bin"
    set -l repo /Volumes/HomeX/kento/Documents/github/kentoje/maestro
    go build -o $HOME/.local/bin/maestro $repo/cmd/maestro
    and echo "maestro rebuilt →" (command -v maestro)
end
