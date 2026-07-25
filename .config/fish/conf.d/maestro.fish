# maestro - the conductor CLI (github.com/kentoje/maestro, built to ~/.local/bin).
#
# State and virtuoso worktrees live off the small internal disk, on the external
# HomeX volume. This single var is the only knob that places them.
set -gx MAESTRO_HOME /Volumes/HomeX/kento/.maestro

# Short handle.
abbr -a mst maestro

# Boot the conductor (the single maestro you talk to) in the current pane.
abbr -a ma maestro

# Dev-browser controls. maf: focus (lazy-opens) this worktree's dev-browser -
# run from inside a workspace/worktree path. mas: stop ALL maestro dev servers +
# browsers (+ portless prune).
abbr -a maf 'maestro browser focus'
abbr -a mas 'maestro browser stop'
