# A tuios daemon started by a coding agent can inherit GIT_PAGER=cat and
# pass it to every new pane, bypassing the user's configured diffnav pager.
if status is-interactive; and test "$TUIOS_ENV" = 1; and test "$GIT_PAGER" = cat
    set --erase --global GIT_PAGER
end
