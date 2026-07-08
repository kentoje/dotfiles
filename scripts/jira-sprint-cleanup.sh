#!/usr/bin/env bash
#
# jira-sprint-cleanup.sh
#
# Reproduces the "advance my merged sprint tickets" cleanup:
#   For each ticket assigned to me in the current sprint that is In Code Review
#   or In Progress, check whether its GitLab MR is merged and whether the merge
#   is in a release tag, then drive the Jira workflow:
#
#     merged + in a release tag        -> Done            (resolution = Done)
#     merged + NOT in a release tag    -> Ready For Production
#     not merged (open/draft/closed)   -> left untouched
#
#   The transition path is:
#     In Progress --("Code Review")--> In Code Review
#                 --("Assign to QA")--> Assigned to QA
#                 [set QA Sub-Status = Done]  (an automation then moves it to
#                                              Ready For Production)
#                 --("Done" + resolution)--> Done   (only for released tickets)
#
# The "deployed to production" signal is a GitLab release TAG that contains the
# merge commit (equivalently, the ticket's entry in the repo CHANGELOG).
#
# DESIGN NOTES
#   * Transitions and fields are resolved BY NAME at runtime, never by numeric
#     id, because different tickets sit on different workflow variants with
#     different transition ids (e.g. "Done" is 271 on one workflow, gated behind
#     an automation-only "DoneAuto" on another).
#   * DRY-RUN by default. Pass --apply to actually mutate Jira.
#   * Tickets whose workflow cannot reach the target state (minimal
#     To-Do/In-Progress/Done workflows, or automation-gated Done) are reported,
#     not forced.
#
# PREREQUISITES
#   * bash 4+, jq, curl, git, glab (GitLab CLI, authenticated: `glab auth status`)
#   * Jira Cloud API auth via env vars:
#       JIRA_BASE_URL   e.g. https://aircall-product.atlassian.net
#       JIRA_EMAIL      your atlassian email
#       JIRA_API_TOKEN  https://id.atlassian.com/manage-profile/security/api-tokens
#
# USAGE
#   ./jira-sprint-cleanup.sh                # dry-run, statuses: In Code Review + In Progress
#   ./jira-sprint-cleanup.sh --apply        # actually perform the transitions
#   ./jira-sprint-cleanup.sh --status "In Code Review"   # restrict to one status
#   ./jira-sprint-cleanup.sh --project CI   # restrict JQL to a project (optional)
#   REPO_MAP="conversation-center-ext=$HOME/dev/cc-ext" ./jira-sprint-cleanup.sh
#
set -uo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
JIRA_BASE_URL="${JIRA_BASE_URL:-https://aircall-product.atlassian.net}"
JIRA_EMAIL="${JIRA_EMAIL:-}"
JIRA_API_TOKEN="${JIRA_API_TOKEN:-}"

QA_SUBSTATUS_FIELD_NAME="QA Sub-Status"
QA_SUBSTATUS_DONE_VALUE="Done"
RESOLUTION_DONE_NAME="Done"

# Optional: local clones for fast/authoritative `git tag --contains`.
# Format: "repoName=path;repoName2=path2". Falls back to the GitLab refs API.
REPO_MAP_DEFAULT="conversation-center-ext=$HOME/Documents/gitlab/dashboard-extensions/conversation-center-ext"
REPO_MAP="${REPO_MAP:-$REPO_MAP_DEFAULT}"

APPLY=false
STATUSES=("In Code Review" "In Progress")
PROJECT_FILTER=""

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --dry-run|-n) APPLY=false; shift ;;
    --status) STATUSES=("$2"); shift 2 ;;
    --project) PROJECT_FILTER="$2"; shift 2 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

for bin in jq curl git glab; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing dependency: $bin" >&2; exit 1; }
done
if [[ -z "$JIRA_EMAIL" || -z "$JIRA_API_TOKEN" ]]; then
  echo "Set JIRA_EMAIL and JIRA_API_TOKEN (see header)." >&2
  exit 1
fi

log()  { printf '%s\n' "$*" >&2; }
info() { printf '  %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# Jira REST helpers (Cloud v3, basic auth)
# ---------------------------------------------------------------------------
jira_get()  { curl -sS -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H 'Accept: application/json' "$JIRA_BASE_URL$1"; }
jira_post() { curl -sS -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H 'Content-Type: application/json' -H 'Accept: application/json' -X POST --data "$2" "$JIRA_BASE_URL$1"; }
jira_put()  { curl -sS -u "$JIRA_EMAIL:$JIRA_API_TOKEN" -H 'Content-Type: application/json' -X PUT --data "$2" "$JIRA_BASE_URL$1"; }

# Paginated JQL search -> prints one issue key per line.
jira_search_keys() {
  local jql="$1" token="" body resp
  while :; do
    body=$(jq -n --arg jql "$jql" --arg tok "$token" \
      '{jql:$jql, maxResults:100, fields:["key"]} + (if $tok=="" then {} else {nextPageToken:$tok} end)')
    resp=$(jira_post "/rest/api/3/search/jql" "$body")
    echo "$resp" | jq -r '.issues[].key'
    token=$(echo "$resp" | jq -r '.nextPageToken // empty')
    [[ -z "$token" ]] && break
  done
}

jira_status()  { jira_get "/rest/api/3/issue/$1?fields=status" | jq -r '.fields.status.name'; }

# Find an available transition by TARGET status name; echo its id (or empty).
jira_transition_id_to() {
  local key="$1" target="$2"
  jira_get "/rest/api/3/issue/$key/transitions" \
    | jq -r --arg t "$target" '.transitions[] | select(.to.name==$t) | .id' | head -1
}

jira_do_transition() {  # key, transitionId, [resolutionName]
  local key="$1" tid="$2" res="${3:-}" body
  if [[ -n "$res" ]]; then
    local rid
    rid=$(jira_get "/rest/api/3/issue/$key/transitions?expand=transitions.fields" \
      | jq -r --arg tid "$tid" --arg r "$res" \
        '.transitions[] | select(.id==$tid) | .fields.resolution.allowedValues[]? | select(.name==$r) | .id' | head -1)
    body=$(jq -n --arg tid "$tid" --arg rid "$rid" \
      '{transition:{id:$tid}, fields: (if $rid=="" then {} else {resolution:{id:$rid}} end)}')
  else
    body=$(jq -n --arg tid "$tid" '{transition:{id:$tid}}')
  fi
  jira_post "/rest/api/3/issue/$key/transitions" "$body"
}

# Set QA Sub-Status = Done. Resolves field id + option id from editmeta by name.
jira_set_qa_done() {
  local key="$1" meta fid oid body
  meta=$(jira_get "/rest/api/3/issue/$key/editmeta")
  fid=$(echo "$meta" | jq -r --arg n "$QA_SUBSTATUS_FIELD_NAME" \
    '.fields | to_entries[] | select(.value.name==$n) | .key' | head -1)
  [[ -z "$fid" ]] && { info "QA Sub-Status field not editable here; skipping field set"; return 1; }
  oid=$(echo "$meta" | jq -r --arg fid "$fid" --arg v "$QA_SUBSTATUS_DONE_VALUE" \
    '.fields[$fid].allowedValues[]? | select(.value==$v) | .id' | head -1)
  [[ -z "$oid" ]] && { info "No '$QA_SUBSTATUS_DONE_VALUE' option for $QA_SUBSTATUS_FIELD_NAME"; return 1; }
  body=$(jq -n --arg fid "$fid" --arg oid "$oid" '{fields: {($fid): {id:$oid}}}')
  jira_put "/rest/api/3/issue/$key" "$body"
}

# ---------------------------------------------------------------------------
# GitLab helpers
# ---------------------------------------------------------------------------
# For a Jira key, emit lines: "state<TAB>project_path<TAB>commit_sha" per MR
# whose title/description references the key.
gl_mrs_for_key() {
  local key="$1"
  # NOTE: .references.full for an MR is "group/project!<iid>" — the "!<iid>"
  # suffix must be stripped to get the project path used by the REST API.
  glab api "search?scope=merge_requests&search=$key&per_page=50" 2>/dev/null \
    | jq -r --arg k "$key" '
        [ .[] | select((.title // "" | test($k)) or (.description // "" | test($k))) ]
        | .[] | [ .state,
                  ((.references.full // .web_url) | sub("!.*$"; "")),
                  (.squash_commit_sha // .merge_commit_sha // .sha) ] | @tsv'
}

repo_local_path() {  # repoName -> path or empty, via REPO_MAP
  local name="$1" pair
  IFS=';' read -ra pairs <<< "$REPO_MAP"
  for pair in "${pairs[@]}"; do
    [[ "${pair%%=*}" == "$name" ]] && { echo "${pair#*=}"; return; }
  done
}

# Is a commit contained in any tag? echo "released <tag>" or "unreleased".
commit_released() {  # project_path (group/.../repo), sha
  local proj="$1" sha="$2" repo_name path tag enc
  repo_name="${proj##*/}"
  path="$(repo_local_path "$repo_name")"
  if [[ -n "$path" && -d "$path/.git" ]]; then
    git -C "$path" fetch --tags --quiet origin 2>/dev/null
    tag=$(git -C "$path" tag --contains "$sha" --sort=creatordate 2>/dev/null | head -1)
    [[ -n "$tag" ]] && { echo "released $tag"; return; }
    echo "unreleased"; return
  fi
  # Fallback: GitLab refs API
  enc=$(printf '%s' "$proj" | jq -sRr @uri)
  tag=$(glab api "projects/$enc/repository/commits/$sha/refs?type=tag&per_page=100" 2>/dev/null \
    | jq -r 'if type=="array" and length>0 then .[0].name else "" end')
  [[ -n "$tag" ]] && echo "released $tag" || echo "unreleased"
}

# ---------------------------------------------------------------------------
# Per-ticket driver
# ---------------------------------------------------------------------------
# Walk the workflow to "Assigned to QA", one hop at a time, by target name.
advance_to_assigned_qa() {
  local key="$1" cur tid hops=0
  while (( hops++ < 4 )); do
    cur=$(jira_status "$key")
    [[ "$cur" == "Assigned to QA" ]] && return 0
    tid=$(jira_transition_id_to "$key" "Assigned to QA")
    if [[ -z "$tid" ]]; then tid=$(jira_transition_id_to "$key" "In Code Review"); fi
    [[ -z "$tid" ]] && return 1
    $APPLY && jira_do_transition "$key" "$tid" >/dev/null || { info "[dry-run] transition -> (via $tid)"; return 0; }
  done
  return 1
}

process_ticket() {
  local key="$1"
  local mrs states=() evidence=() unreleased=0 released=0 any_merged=false
  mrs="$(gl_mrs_for_key "$key")"

  if [[ -z "$mrs" ]]; then
    log "SKIP  $key  — no MR found"; return
  fi

  # Evaluate every referencing MR.
  while IFS=$'\t' read -r state proj sha; do
    [[ -z "$state" ]] && continue
    states+=("$state @ $proj")
    if [[ "$state" == "merged" ]]; then
      any_merged=true
      local rel; rel="$(commit_released "$proj" "$sha")"
      if [[ "$rel" == released* ]]; then released=$((released+1)); else unreleased=$((unreleased+1)); fi
      evidence+=("$proj  merged  ${sha:0:10}  $rel")
    else
      evidence+=("$proj  $state  (not merged)")
    fi
  done <<< "$mrs"

  if ! $any_merged; then
    log "SKIP  $key  — not merged (${states[*]})"; return
  fi

  # Released only if EVERY merged MR is in a tag.
  local target
  if (( unreleased == 0 )); then target="Done"; else target="Ready For Production"; fi
  log "MOVE  $key  -> $target   (released=$released unreleased=$unreleased)"
  local e; for e in "${evidence[@]}"; do info "$e"; done

  $APPLY || { info "[dry-run] would: Assign to QA -> set $QA_SUBSTATUS_FIELD_NAME=Done -> reach '$target'"; return; }

  # 1) reach Assigned to QA
  if ! advance_to_assigned_qa "$key"; then
    info "could not reach 'Assigned to QA' (unusual workflow) — left as is"; return
  fi
  # 2) QA Sub-Status = Done (this triggers the auto-move to Ready For Production)
  jira_set_qa_done "$key" >/dev/null || true
  # 3) if released, push to Done with a resolution
  if [[ "$target" == "Done" ]]; then
    sleep 2  # let the QA-Done automation settle
    local tid; tid=$(jira_transition_id_to "$key" "Done")
    if [[ -n "$tid" ]]; then
      jira_do_transition "$key" "$tid" "$RESOLUTION_DONE_NAME" >/dev/null
    else
      info "no manual 'Done' transition available (automation-gated) — left in Ready For Production"
    fi
  fi
  info "final status: $(jira_status "$key")"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
status_clause=$(printf '"%s",' "${STATUSES[@]}"); status_clause="${status_clause%,}"
jql="assignee = currentUser() AND sprint in openSprints() AND status in ($status_clause)"
[[ -n "$PROJECT_FILTER" ]] && jql="$jql AND project = $PROJECT_FILTER"
jql="$jql ORDER BY key ASC"

log "JQL: $jql"
$APPLY && log "MODE: APPLY (mutating Jira)" || log "MODE: DRY-RUN (no changes). Re-run with --apply to execute."
log "----------------------------------------------------------------------"

mapfile -t keys < <(jira_search_keys "$jql")
log "Found ${#keys[@]} ticket(s)."
for k in "${keys[@]}"; do
  [[ -z "$k" ]] && continue
  process_ticket "$k"
done
log "----------------------------------------------------------------------"
log "Done."
