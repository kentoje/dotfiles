#!/usr/bin/env bash
# watch-pipeline.sh — poll a GitLab CI pipeline until it reaches a terminal state.
# Deterministic glue for the aircall-dev-flow skill. Uses `glab ci get -F json`.
#
# Usage:
#   watch-pipeline.sh                       # current branch, current repo
#   watch-pipeline.sh -b feat/x             # specific branch
#   watch-pipeline.sh -R owner/repo         # specific repo
#   watch-pipeline.sh -i 30 -t 2400         # poll every 30s, give up after 2400s
set -euo pipefail

BRANCH=""
REPO=""
INTERVAL=20
TIMEOUT=1800
while [ $# -gt 0 ]; do
  case "$1" in
  -b | --branch)
    BRANCH="$2"
    shift 2
    ;;
  -R | --repo)
    REPO="$2"
    shift 2
    ;;
  -i | --interval)
    INTERVAL="$2"
    shift 2
    ;;
  -t | --timeout)
    TIMEOUT="$2"
    shift 2
    ;;
  -h | --help)
    sed -n '2,12p' "$0"
    exit 0
    ;;
  *)
    echo "unknown arg: $1" >&2
    exit 2
    ;;
  esac
done

command -v glab >/dev/null || {
  echo "glab not found on PATH" >&2
  exit 127
}
command -v python3 >/dev/null || {
  echo "python3 not found on PATH" >&2
  exit 127
}

ARGS=(ci get -F json)
[ -n "$BRANCH" ] && ARGS+=(-b "$BRANCH")
[ -n "$REPO" ] && ARGS+=(-R "$REPO")

# Terminal pipeline states — stop polling once reached.
is_terminal() { case "$1" in success | failed | canceled | skipped | manual) return 0 ;; *) return 1 ;; esac }

START=$(date +%s)
while :; do
  if ! JSON="$(glab "${ARGS[@]}" -d 2>/dev/null)"; then
    echo "⏳ no pipeline yet for $([ -n "$BRANCH" ] && echo "$BRANCH" || echo 'current branch') — waiting…"
    JSON=""
  fi

  if [ -n "$JSON" ]; then
    STATUS="$(printf '%s' "$JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)"
    printf '[%s] pipeline: %s\n' "$(date +%H:%M:%S)" "${STATUS:-unknown}"
    if [ -n "$STATUS" ] && is_terminal "$STATUS"; then
      if [ "$STATUS" = failed ]; then
        echo "── failing jobs ──"
        printf '%s' "$JSON" | python3 -c '
import sys, json
d = json.load(sys.stdin)
jobs = d.get("jobs") or d.get("Jobs") or []
bad = [j for j in jobs if (j.get("status") or "").lower() in ("failed", "canceled")]
for j in bad:
    print("  x %s  (%s)  %s" % (j.get("name", "?"), j.get("status"), j.get("web_url", "")))
if not bad:
    print("  (no per-job detail available)")
' 2>/dev/null || echo "  (could not parse jobs)"
        exit 1
      fi
      [ "$STATUS" = success ] && exit 0
      exit 0 # canceled/skipped/manual: terminal, nothing more to watch
    fi
  fi

  NOW=$(date +%s)
  if [ $((NOW - START)) -ge "$TIMEOUT" ]; then
    echo "⌛ timed out after ${TIMEOUT}s — pipeline still not terminal." >&2
    exit 3
  fi
  sleep "$INTERVAL"
done
