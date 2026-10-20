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
case $- in
  *i*) eval "$(fnm env --use-on-cd --shell bash 2>/dev/null)" ;;
esac
# <<< mvm dev env <<<

