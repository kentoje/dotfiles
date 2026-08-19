# Shared Release Ping Workflow

This file defines the mechanics shared by every dashboard release-ping persona.
The invoking skill supplies the voice, emoji usage, and narrative framing.

## Preconditions

- Run from the repository root; this workflow uses local `git log`, not the
  GitLab API.
- Slack MCP (`mcp__claude_ai_Slack__*`) must be authenticated.
- `master` has a semantic-release tag marking the last release.

## Defaults

| Parameter | Default | Override when |
| --- | --- | --- |
| Release cutoff | Latest tag reachable from `HEAD` | The user specifies a tag or SHA |
| Slack channel | `C0135RE8U1Y` (`#eng-dashboard-core`) | Running for another repo or team |
| Mention style | `<@USER_ID>` | Never use `@name`; it does not notify |

## Workflow

### 1. Find the release cutoff

```bash
git describe --tags --abbrev=0
```

If this fails, stop and ask the user for a cutoff. If a cutoff is provided, use
it instead of the discovered tag.

### 2. List unreleased commits

```bash
git log <LATEST_TAG>..HEAD --pretty=format:"%h|%an|%ae|%s"
```

The fields are short hash, author name, author email, and subject. Preserve
one row per commit. If the result is empty, report that the branch is already
at the latest release and stop.

### 3. Resolve commit authors on Slack

For every unique author email, look up the Slack user. Run the independent
lookups in parallel.

Use `mcp__claude_ai_Slack__slack_search_users(query: "<email>", limit: 3,
response_format: "concise")` for each initial lookup.

1. Search by email.
2. If there is no match, retry once using the author's full name.
3. If there is still no match, leave the plain author name in the draft and
   warn the user to tag that person manually.
4. Retry a transient `Invalid content from server` error once.

Deduplicate lookups by email, not author name.

### 4. Read recent channel context

Read the 15 most recent channel messages before composing. Identify the latest
release ping and avoid repeating its opening image or phrasing. The persona
skill must still make the new narrative specific to the actual commits.

Use `mcp__claude_ai_Slack__slack_read_channel(channel_id: <CHANNEL_ID>,
limit: 15, response_format: "concise")`.

### 5. Build a draft

Use the Slack draft operation, never the send operation on the first pass.
Mentions cannot be cleanly reversed after a send.

Call `mcp__claude_ai_Slack__slack_send_message_draft`; do not use
`slack_send_message` before approval.

Every draft must contain these mechanics in this order:

1. Bold one-line headline naming commit count `N` and `<LATEST_TAG>`.
2. Short, persona-flavored intro asking committers to confirm production safety.
3. One bullet per commit: `• \`<hash>\` — <@USER_ID> — <commit subject>`.
4. Sign-off line: react `:shipit:` for safe to ship; react `:no_entry:` to hold
   the release.

Keep the bullets clean for traceability. Put narrative flavor in the headline,
intro, and sign-off. Inline-code each hash. Repeating a mention on several
commit rows is intentional: Slack coalesces duplicate notifications.

### 6. Present the draft and await approval

Show the Slack draft URL (`channel_link`), returned `draft_id`, and a rendered
preview replacing `<@USER_ID>` with `@Name`. Do not send until the user gives
clear approval, for example “send it” or “lgtm”.

On approval, send the same body with the draft ID. Passing the draft ID deletes
the draft when the message sends.

On approval, call:

```
mcp__claude_ai_Slack__slack_send_message(
  channel_id: <CHANNEL_ID>,
  draft_id: <DRAFT_ID>,
  message: <same body as the draft>
)
```

### 7. Record the sent message

Return the resulting `message_ts`. For a later reminder, send with that value
as `thread_ts` so the bump stays in the release thread.

## Edge Cases

- In private channels, tagged non-members receive a notification but cannot
  read the thread. Check membership when external accounts are involved.
- `Co-authored-by:` trailers are outside the default workflow; `%an` and `%ae`
  only identify the commit author.
- Name variants are safe because deduplication uses email.
- If multiple tags point at a commit, `git describe` selects the newest one,
  which is the desired unreleased cutoff.
