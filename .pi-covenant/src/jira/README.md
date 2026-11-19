# Jira Cloud in Pi

Set these in the environment that loads the standard Pi extension:

- `PI_COVENANT_JIRA_SITE` is an HTTPS site origin such as `https://example.atlassian.net`.
- `PI_COVENANT_JIRA_EMAIL` is the Jira account email.
- `PI_COVENANT_JIRA_CREDENTIAL_FILE` is an absolute path to a private file containing the API token on one line.

The tool has one configured Cloud site per Pi host. You can pass that origin as `site` explicitly. The adapter uses Jira Cloud REST v3 with Basic authentication, fixed routes and no redirects. Get and search work headlessly. Each write needs trusted confirmation of the provider payload and target. Pi displays exact duplicate matches in the create prompt when applicable. Concurrent writes for the same issue or create project in one Pi tool instance are blocked. Jira changes made elsewhere can still race observations.

| Action | Arguments |
| --- | --- |
| `get` | `key`, optional field IDs in `fields` |
| `search` | `query` (JQL), optional `project`, `page_size` and the returned `cursor` |
| `create` | `project`, `issue_type`, `summary`, optional `fields` object |
| `update` | `key`, nonempty `fields` object |
| `comment` | `key`, plain-text `body` |
| `transition` | `key`, `transition`, optional `fields` object |

Use the current Jira field ID when names are ambiguous. Values use Jira Cloud wire format, including Atlassian Document Format for rich-text fields. The comment action converts plain text to that format. Issue types and transitions can also be selected by exact unique name. A failed readback after acknowledgement preserves the known effect and identity with `partial`. After an `indeterminate` write, inspect Jira before issuing another write.

Creation scans at most 20 visible Jira search pages per snapshot, requesting 100 issues per page. It includes closed issues and blocks if the scan cannot be verified as complete. The second snapshot detects changed duplicate evidence after confirmation. Jira visibility and search index freshness bound duplicate detection. Data Center, OAuth, and live tenant compatibility are outside this implementation's verified scope.

See [the design decision](../../docs/decisions/ADR-013-jira-and-duplicate-preflight.md) and [the Jira Cloud Issues API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/).
