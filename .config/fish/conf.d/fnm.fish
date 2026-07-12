set -gx FNM_LOGLEVEL error
# Pin fnm's data dir to the internal home. Toolchains live on /Users (fast, and
# readable by sandboxes); only bulk app-data stays on /Volumes. Without this an
# older /Volumes value can be inherited from the environment.
set -gx FNM_DIR "$HOME/.local/share/fnm"
fnm env --use-on-cd | source
