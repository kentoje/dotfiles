# maestro - the conductor CLI (github.com/kentoje/maestro, built to ~/.local/bin).
#
# State and virtuoso worktrees live off the small internal disk, on the external
# HomeX volume. This single var is the only knob that places them.
set -gx MAESTRO_HOME /Volumes/HomeX/kento/.maestro

# Short handle.
abbr -a mst maestro

# Boot the conductor (the single maestro you talk to).
abbr -a ma 'maestro conduct'
