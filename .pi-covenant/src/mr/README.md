# GitLab merge requests in Pi

The `mr` tool uses the same trusted GitLab host and credential file as `gitlab`. Pass an `iid` explicitly or let the tool select exactly one open same-project MR for the resolved checkout branch. Explicit repository selectors and cwd follow the shared GitLab target policy.

| Action | Behavior |
| --- | --- |
| `status` | Report the selected MR, head pipeline and whether its SHA matches, and unresolved discussion count when review pagination is complete |
| `threads` | Return one ordered discussion page with author, body, resolution and available location, plus the continuation cursor |
| `reply` | Post to the exact discussion. Set `resolve: true` for a separate resolution after the reply is acknowledged |
| `update` | Change the supplied `title` or `description`. An empty description clears it |

Pi asks for exact confirmation before remote writes. A posted reply retains its ID if resolution fails. Inspect GitLab after an indeterminate write before submitting another. Discussion views use the leading note and report unknown bot identity when GitLab omits it. Status reads at most 20 discussion pages and leaves the count unknown if evidence is incomplete.

## Optional creation guard

Set `PI_COVENANT_INTERCEPT_MR_CREATION=1` to guard the standard Pi Bash tool's supported direct creation commands. Example:

```sh
cd /path/to/checkout && glab mr create --repo https://gitlab.example/team/app --source-branch topic --target-branch main --title "Implement change" --description "Details" --draft
```

The hook supports literal `glab mr create` and `glab mr new`, with an optional single literal `cd PATH &&`. Use a full HTTPS repository URL and explicit source, target and title. The four selection flags and description accept their long or short forms. The supported switches are `--draft`, `--wip`, `--yes`, `-y`, `--no-editor` and `--push=false`. Recognized unsupported creation syntax is blocked. The hook covers Pi Bash calls in the stated grammar. Aliases, user-terminal commands, arbitrary scripts, API calls and other shell tools are outside that coverage.

The guard performs a read-only complete branch lookup. An existing same-target MR is returned for reuse. Ambiguity, a different target, or unresolved lookup blocks the command. GitLab-side races remain possible after the check.

For project-specific delivery rules, set `PI_COVENANT_MR_POLICY_FILE` to an absolute JSON file on the trusted host. Keys are canonical HTTPS repository URLs. All fields are optional:

```json
{
  "https://gitlab.example/team/app": {
    "titlePrefix": "feat: ",
    "changedPathPrefix": ".changeset/",
    "commitSubjectPattern": "^feat:"
  }
}
```

The title rule also applies to explicit MR title updates. Branch rules inspect committed source and target remote-tracking refs for the selected remote in the checkout. They use the local tracking snapshot and block when the required evidence is unavailable. A repository without an entry has no added policy. The structured preflight is available for the future `/ship` workflow.

See [ADR-014](../../docs/decisions/ADR-014-merge-requests-and-creation-guard.md), the [GitLab MR API](https://docs.gitlab.com/api/merge_requests/), and the [GitLab Discussions API](https://docs.gitlab.com/api/discussions/).
