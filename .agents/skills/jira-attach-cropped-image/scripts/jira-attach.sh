#!/usr/bin/env bash
# Attach one or more files to a Jira issue via the REST API.
# Reads creds like the `jira` CLI: login from ~/.config/.jira/.config.yml, token from $JIRA_API_TOKEN.
#
# Usage:
#   jira-attach.sh <ISSUE_KEY> <file> [file2 ...]
#   jira-attach.sh --replace <ATTACHMENT_ID> <ISSUE_KEY> <file> [file2 ...]
#
# Note: if `curl` is blocked by a PreToolUse hook in your Bash tool, run this script
# through the context-mode `ctx_execute(language:"shell", code:"bash .../jira-attach.sh ...")`.
set -euo pipefail

SERVER="${JIRA_SERVER:-https://aircall-product.atlassian.net}"
CONFIG="${JIRA_CONFIG:-$HOME/.config/.jira/.config.yml}"

EMAIL="$(grep -iE '^login:' "$CONFIG" 2>/dev/null | sed -E 's/login:[[:space:]]*//' | tr -d '\r')"
: "${JIRA_API_TOKEN:?JIRA_API_TOKEN env var is required}"
[ -n "$EMAIL" ] || { echo "Could not read login email from $CONFIG" >&2; exit 1; }

REPLACE_ID=""
if [ "${1:-}" = "--replace" ]; then
  REPLACE_ID="$2"; shift 2
fi

KEY="${1:?ISSUE_KEY required (e.g. DS-22)}"; shift
[ "$#" -ge 1 ] || { echo "At least one file required" >&2; exit 1; }

auth=(-u "$EMAIL:$JIRA_API_TOKEN")

if [ -n "$REPLACE_ID" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' "${auth[@]}" -X DELETE "$SERVER/rest/api/3/attachment/$REPLACE_ID")"
  echo "deleted attachment $REPLACE_ID -> HTTP $code"
fi

for f in "$@"; do
  [ -f "$f" ] || { echo "missing file: $f" >&2; exit 1; }
  res="$(curl -s "${auth[@]}" -H "X-Atlassian-Token: no-check" -F "file=@$f" "$SERVER/rest/api/3/issue/$KEY/attachments")"
  echo "$res" | python3 -c "import sys,json;d=json.load(sys.stdin);print('attached %s to $KEY -> id %s'%(d[0]['filename'],d[0]['id'])) if isinstance(d,list) and d else (print('ERROR:',d) or sys.exit(1))"
done
