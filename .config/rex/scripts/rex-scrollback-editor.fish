#!/usr/bin/env fish
# Neovim half of the Rex open_scrollback_in_editor action
# (pane-scrollback-editor.lua). $argv[1] is a plain-text snapshot of the pane's
# scrollback; it is opened read-only at the bottom, and removed on exit.
# q closes, like leaving copy mode.

set -l snapshot $argv[1]
test -f "$snapshot"; or exit 0

# Pin the last line to the bottom, the way a terminal shows it: the
# rexscrollback filetype turns off scrollEOF (nvim plugins/eof.lua), and
# scrolloff=0 stops your scrolloff=20 from centering the cursor.
nvim -R -n \
    -c 'setfiletype rexscrollback' \
    -c 'setlocal scrolloff=0' \
    -c 'normal! Gzb' \
    -c 'autocmd VimResized * ++once normal! Gzb' \
    -c 'setlocal nomodifiable nolist nospell' \
    -c 'nnoremap <buffer> <silent> q <cmd>qa!<cr>' \
    $snapshot

rm -f $snapshot
