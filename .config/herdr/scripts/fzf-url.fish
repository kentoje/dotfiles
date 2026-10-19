#!/usr/bin/env fish
# herdr equivalent of wfxr/tmux-fzf-url.
# Scans the focused pane for URLs, fzf-picks (multi-select), and opens each
# choice in the default browser.
#
# Wired from config.toml as a `type = "pane"` [[keys.command]] so it runs in a
# temp pane with a TTY (fzf needs one). $HERDR_ACTIVE_PANE_ID / $HERDR_BIN_PATH
# are injected by herdr — same pair the fd|fzf file picker uses.

set -l pane $HERDR_ACTIVE_PANE_ID
test -n "$pane"; or exit 0

set -l herdr $HERDR_BIN_PATH
test -n "$herdr"; or set herdr (command -v herdr)

set -l url_re '(https?|ftp|file|ssh|git)://[A-Za-z0-9._~:/?#@!$&*+,;=%-]+|www\.[A-Za-z0-9._~:/?#@!$&*+,;=%-]+'

# Do not read deep scrollback. On an alt-screen pane (pi, nvim, lazygit) herdr
# 0.9.5 reconstructs history in PendingAltScreenRead, and that read is ~1.8s
# for a few hundred lines. `visible` is the screen you are looking at and
# returns in ~0ms. A shallow `recent` adds the lines just above it, still
# ~10ms, and stops before that reconstruction. Cmd+o is for a link on screen,
# not one buried in an agent transcript.
set -l text (
    $herdr pane read "$pane" --source visible
    $herdr pane read "$pane" --source recent --lines 40
)

set -l urls (string join \n $text | grep -oE "$url_re" | tac | awk '!seen[$0]++')

test -z "$urls"; and exit 0

printf '%s\n' $urls \
    | fzf --multi --no-sort --prompt='url> ' --height=100% --border \
    | while read -l u
        # www.* has no scheme; open needs one.
        string match -q 'www.*' -- $u; and set u "https://$u"
        open "$u"
    end
