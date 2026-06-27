#!/usr/bin/env fish
# herdr equivalent of wfxr/tmux-fzf-url.
# Scans the focused pane's scrollback for URLs, fzf-picks (multi-select),
# and opens each choice in the default browser.
#
# Wired from config.toml as a `type = "pane"` [[keys.command]] so it runs in a
# temp pane with a TTY (fzf needs one). $HERDR_ACTIVE_PANE_ID / $HERDR_BIN_PATH
# are injected by herdr — same pair the fd|fzf file picker uses.

set -l pane $HERDR_ACTIVE_PANE_ID
test -n "$pane"; or exit 0

set -l herdr $HERDR_BIN_PATH
test -n "$herdr"; and set herdr (command -v herdr)

# How many lines of scrollback to scan. recent-unwrapped rejoins soft-wrapped
# lines so URLs split across the terminal width are recovered intact.
set -l limit 3000

set -l url_re '(https?|ftp|file|ssh|git)://[A-Za-z0-9._~:/?#@!$&*+,;=%-]+|www\.[A-Za-z0-9._~:/?#@!$&*+,;=%-]+'

# Newest-first (tac), de-duplicated while preserving order (awk).
set -l urls ($herdr pane read "$pane" --source recent-unwrapped --lines $limit \
    | grep -oE "$url_re" | tac | awk '!seen[$0]++')

test -z "$urls"; and exit 0

printf '%s\n' $urls \
    | fzf --multi --no-sort --prompt='url> ' --height=100% --border \
    | while read -l u
        # www.* has no scheme; open needs one.
        string match -q 'www.*' -- $u; and set u "https://$u"
        open "$u"
    end
