# maestro - the conductor CLI (github.com/kentoje/maestro, built to ~/.local/bin).
#
# State and virtuoso worktrees live off the small internal disk, on the external
# HomeX volume. This single var is the only knob that places them.
set -gx MAESTRO_HOME /Volumes/HomeX/kento/.maestro

abbr -a ma maestro

# Boot the conductor (the single maestro you talk to) in the current pane, one
# abbr per agent CLI: mc = conduct, last letter = the kind. The conductor's own
# kind is what its virtuosi inherit, so this choice picks the whole fleet.
#
#   mcc  claude - Opus 4.8 1M
#   mcp  pi     - GPT-5.6 Sol conducting, Luna implementing, both at max
#   mco  omp    - GPT-5.6 Terra conducting, Luna implementing, both at xhigh
#
# (mc* is conducting, ma* is dev-browser control - the two families stay apart.)
abbr -a mcc 'maestro conduct --agent claude'
abbr -a mcp 'maestro conduct --agent pi'
abbr -a mco 'maestro conduct --agent omp'

# Dev-browser controls. maf: focus (lazy-opens) this worktree's dev-browser -
# run from inside a workspace/worktree path. mas: stop ALL maestro dev servers +
# browsers (+ portless prune).
abbr -a maf 'maestro browser focus'
abbr -a mas 'maestro browser stop'
