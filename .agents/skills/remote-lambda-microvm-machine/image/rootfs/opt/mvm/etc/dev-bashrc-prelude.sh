# >>> mvm dev env (prepended by the dev MicroVM image) >>>
# Runs before Ubuntu's non-interactive early return below, so `ssh host cmd`,
# login shells and herdr panes all get the same PATH and env.
if [ -r "$HOME/.config/mvm/env.sh" ]; then
  . "$HOME/.config/mvm/env.sh"
fi
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/share/fnm:$HOME/.cargo/bin:/opt/mvm/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
export FNM_COREPACK_ENABLED=true
export EDITOR=nvim
# Interactive shells switch Node to the directory's .nvmrc / .node-version / engines on cd,
# installing a missing version without asking: fnm's own --use-on-cd hook prompts [y/N],
# which blocks `mvm agent` (it types `cd <repo> && <agent>` into the shell).
mvm_use_node_for_cwd() {
  [[ -f .node-version || -f .nvmrc || -f package.json ]] || return 0
  # fnm 1.39 installs a missing version with --install-if-missing but does not switch to it.
  fnm use --silent-if-unchanged --install-if-missing </dev/null && fnm use --silent-if-unchanged </dev/null
}
case $- in
  *i*)
    eval "$(fnm env --shell bash 2>/dev/null)"
    cd() { builtin cd "$@" && mvm_use_node_for_cwd; }
    mvm_use_node_for_cwd
    ;;
esac
# <<< mvm dev env <<<

