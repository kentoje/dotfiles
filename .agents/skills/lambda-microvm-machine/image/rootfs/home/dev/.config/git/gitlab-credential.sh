#!/bin/sh
# git credential helper for https://gitlab.com. GITLAB_TOKEN comes from the MicroVM env
# secret (~/.config/mvm/env.sh). Never write the token to git config.
while IFS= read -r line; do
  [ -z "$line" ] && break
done
if [ -z "${GITLAB_TOKEN:-}" ] && [ -r "$HOME/.config/mvm/env.sh" ]; then
  . "$HOME/.config/mvm/env.sh"
fi
[ -n "${GITLAB_TOKEN:-}" ] || exit 1
printf 'username=oauth2\npassword=%s\n' "$GITLAB_TOKEN"
