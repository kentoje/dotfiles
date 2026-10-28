#!/bin/sh
# Build explicitly at install/update time; never compile on a navigation keypress.
set -eu
project=$(CDPATH='' cd -- "$(dirname -- "$0")/../agent-pane-focus" && pwd)
cargo build --release --locked --manifest-path "$project/Cargo.toml"
mkdir -p "$HOME/.local/bin"
# Atomic replacement keeps an in-flight keypress on the complete previous binary.
install -m 755 "$project/target/release/tuios-agent-pane-focus" "$HOME/.local/bin/tuios-agent-pane-focus.new"
mv -f "$HOME/.local/bin/tuios-agent-pane-focus.new" "$HOME/.local/bin/tuios-agent-pane-focus"
