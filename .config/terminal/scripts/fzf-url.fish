#!/usr/bin/env fish
# Shared Herdr / TUIOS URL picker, equivalent to wfxr/tmux-fzf-url.
# Scans the focused pane for URLs, fzf-picks (multi-select), and opens each
# choice in the default browser.
#
# Runs in a Herdr command pane or TUIOS popup with a TTY (fzf needs one).
# Herdr supplies $HERDR_ACTIVE_PANE_ID / $HERDR_BIN_PATH; TUIOS supplies
# $TUIOS_ACTIVE_PANE_ID to identify the source pane.

set -l url_re '(https?|ftp|file|ssh|git)://[A-Za-z0-9._~:/?#@!$&*+,;=%-]+|www\.[A-Za-z0-9._~:/?#@!$&*+,;=%-]+'

# tuios runs this too, as a popup command key (.config/tuios/config.toml), and
# hands the source pane over as $TUIOS_ACTIVE_PANE_ID. Check it first: a tuios
# pane also carries herdr's variables, but not HERDR_ACTIVE_PANE_ID.
set -l text
if test -n "$TUIOS_ACTIVE_PANE_ID"
    # The screen plus the 40 lines above it, the same window as the herdr read below.
    set text (tuios capture-pane -w "$TUIOS_ACTIVE_PANE_ID" --scrollback --lines 80 --unwrap)
else
    set -l pane $HERDR_ACTIVE_PANE_ID
    test -n "$pane"; or exit 0

    set -l herdr $HERDR_BIN_PATH
    test -n "$herdr"; or set herdr (command -v herdr)

    # Do not read deep scrollback. On an alt-screen pane (pi, nvim, lazygit) herdr
    # 0.9.5 reconstructs history in PendingAltScreenRead, and that read is ~1.8s
    # for a few hundred lines. `visible` is the screen you are looking at and
    # returns in ~0ms. A shallow `recent` adds the lines just above it, still
    # ~10ms, and stops before that reconstruction. Cmd+o is for a link on screen,
    # not one buried in an agent transcript.
    set text (
        $herdr pane read "$pane" --source visible
        $herdr pane read "$pane" --source recent --lines 40
    )
end

set -l urls (string join \n $text | grep -oE "$url_re" | tac | awk '!seen[$0]++')

test -z "$urls"; and exit 0

# TUIOS 0.10.1 intercepts Ctrl J / Ctrl K for pane navigation, even in popups.
# Its navigator protocol lets this picker own the focus keys until it exits.
# Requires appearance.nvim_navigation = true in the TUIOS config.
# Write to the TTY so the control sequence never enters the URL pipeline.
if test -n "$TUIOS_ACTIVE_PANE_ID"
    printf '\e]7777;tuios-nvim-navigator;state;active\a' >/dev/tty
end

printf '%s\n' $urls \
    | fzf --multi --no-sort --prompt='url> ' --height=100% --border \
    | while read -l u
        # www.* has no scheme; open needs one.
        string match -q 'www.*' -- $u; and set u "https://$u"
        open "$u"
    end

if test -n "$TUIOS_ACTIVE_PANE_ID"
    printf '\e]7777;tuios-nvim-navigator;state;inactive\a' >/dev/tty
end
