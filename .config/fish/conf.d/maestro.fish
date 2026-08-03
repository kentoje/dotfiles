# maestro - the conductor CLI (github.com/kentoje/maestro, built to ~/.local/bin).
#
# State and virtuoso worktrees live off the small internal disk, on the external
# HomeX volume. This single var is the only knob that places them.
set -gx MAESTRO_HOME /Volumes/HomeX/kento/.maestro

# The model every `--agent pi` launch uses - conductor AND virtuosi - unless an
# explicit --model overrides it. One knob, no rebuild.
#
# maestro's compiled-in fallback is `anthropic/claude-opus-4-8`, which is dead
# here: pi's Anthropic OAuth refresh token is expired ("invalid_grant"), so a pi
# agent on the fallback dies before it reads its task. This routes via the Aircall
# LLM gateway instead, which is what pi is configured for in
# ~/.pi/agent/models.json. Swap freely, e.g. llmgateway/aircall/moonshotai.kimi-k2.5.
# Unset it once `/login anthropic` inside pi is restored, if you prefer Opus.
set -gx MAESTRO_PI_MODEL llmgateway/aircall/zai.glm-5

# Boot the conductor (the single maestro you talk to) in the current pane.
# ma: the default claude conductor. mac: the same conductor running pi instead.
abbr -a ma maestro
abbr -a mac 'maestro conduct --agent pi'

# Dev-browser controls. maf: focus (lazy-opens) this worktree's dev-browser -
# run from inside a workspace/worktree path. mas: stop ALL maestro dev servers +
# browsers (+ portless prune).
abbr -a maf 'maestro browser focus'
abbr -a mas 'maestro browser stop'
