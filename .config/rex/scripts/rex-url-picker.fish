#!/usr/bin/env fish
# fzf half of the Rex open_screen_url action (screen-url-picker.lua).
# $argv[1] is a file with one URL per line, newest first. It is removed here.

set -l list $argv[1]
test -f "$list"; or exit 0

fzf --multi --no-sort --prompt='url> ' --height=100% --border <$list \
    | while read -l url
        open "$url"
    end

rm -f $list
