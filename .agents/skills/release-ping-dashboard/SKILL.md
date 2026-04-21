---
name: release-ping-dashboard
description: >
  Find commits on `master` that have not been released yet, map each author
  to their Slack user ID via email, and draft a Slack message pinging them
  for prod-release sign-off. Use when the user asks to "check unreleased
  commits", "ping authors before prod release", or "who hasn't signed off
  on the release yet" for a GitLab-hosted repo (e.g. dashboard-v4).
---

# Release Ping

Finds commits on `master` past the latest release tag, looks up each author on
Slack, and drafts a message asking each one to confirm their change is safe to
ship to prod.

## Precondition

- Run from the **repo root** (the skill uses local `git log`, not the GitLab API).
- Slack MCP (`mcp__claude_ai_Slack__*`) must be authenticated.
- A git tag exists on `master` marking the last release (semantic-release convention).

## Defaults

| Parameter      | Default                               | Override when                                                |
| -------------- | ------------------------------------- | ------------------------------------------------------------ |
| Release cutoff | Latest git tag reachable from `HEAD`  | User wants a specific tag or SHA                             |
| Slack channel  | `C0135RE8U1Y` (#eng-dashboard-core)   | Running for a different repo/team                            |
| Mention style  | `<@USER_ID>` (triggers notifications) | Never use `@name` — it renders as grey text and pings no one |

## Steps

### 1. Find the release cutoff

```bash
git describe --tags --abbrev=0
```

This resolves to the latest tag (e.g. `v0.287.0`). If this fails, the repo
has no tags — stop and ask the user what cutoff to use.

### 2. List unreleased commits with authors

```bash
git log <LATEST_TAG>..HEAD --pretty=format:"%h|%an|%ae|%s"
```

Pipe-separated fields: short-hash | author name | author email | subject.
Keep the raw output in the working context — every row becomes a line in the
Slack message.

If the list is empty, the tag **is** the head. Tell the user "already at the
latest release" and stop.

### 3. Resolve each unique email to a Slack user

For each **unique** email in the commit list, call:

```
mcp__claude_ai_Slack__slack_search_users(query: "<email>", limit: 3, response_format: "concise")
```

Run these in parallel (single message, multiple tool calls).

- **Fallback 1**: if the email returns zero results, retry with just the
  author's full name (handles `ext-` prefix mismatches or name-only commits).
- **Fallback 2**: if still zero, keep the author's plain name in the message
  and warn the user: "Couldn't resolve <name> on Slack — tag manually."
- **Transient proxy errors** (`Invalid content from server`) are retry-once
  situations, not a reason to abandon the query.

### 4. Draft the Slack message

Use `slack_send_message_draft` (**never** `slack_send_message` on the first
pass — Slack mentions are not easily reversible).

Message template:

```
:shipit: *The Squirrel King demands tribute — N commits stockpiled past `<LATEST_TAG>`* :shipit:

Hear ye, hear ye! Your Squirrel King :shipit: has gathered the following acorns and is ready to bury them in the prod orchard. Step forth, noble committers, and vouch that your nut is safe to ship:

• `<hash>` — <@USER_ID> — <commit subject>
• `<hash>` — <@USER_ID> — <commit subject>
...

React with :shipit: if your acorn is prod-worthy, or :no_entry: if the King must hold the horde. Long live the shipit. :crown:
```

**Tone**: you are the :shipit: Squirrel King of Releases. Lean into it — playful, regal, squirrel-flavored. Use `:shipit:` liberally (opening, closing, reactions). Keep it fun but still actionable: the bullets, mentions, and sign-off mechanics stay intact.

Formatting rules:

- One bullet per commit (do **not** collapse multi-commit authors into one
  row — per-commit traceability matters when someone says "hold commit X").
- Slack re-uses the same notification for duplicate `<@USER_ID>` mentions,
  so repeating the tag costs nothing.
- Inline-code the hash with backticks to make it copy-pasteable.

### 5. Show the preview, then send on confirmation

After drafting, print:

- The Slack web URL of the draft (from `channel_link`).
- The `draft_id` returned.
- A rendered preview of the message with `@Name` substituted back for each
  `<@USER_ID>` so the user can spot missing / wrong pings.

Wait for the user's go-ahead ("send it", "lgtm", etc.).

On confirmation, call:

```
mcp__claude_ai_Slack__slack_send_message(
  channel_id: <CHANNEL_ID>,
  draft_id: <DRAFT_ID>,
  message: <same body as the draft>
)
```

Passing `draft_id` auto-deletes the draft when the message sends.

### 6. Return the message timestamp

After sending, surface the `message_ts` (e.g. `1776680211.911449`). Save it
for follow-ups: passing it as `thread_ts` to `slack_send_message` posts a
reply in-thread ("bump — still waiting on X") instead of creating a new
parent message.

## Gotchas

- **Private channels**: if the channel is private, tagged users who aren't
  members will still receive a DM-style notification but can't see the
  thread. Worth sanity-checking membership for `ext-` accounts.
- **`Co-authored-by:` trailers are ignored** by `%an`/`%ae`. If you need
  to ping co-authors, parse the raw commit bodies separately — not in
  scope for the default flow.
- **Mixed-case author names** (e.g. `Pierre Goutheraud` vs `Pierre Gouthéraud`)
  come from different `git config user.name` values across machines. Both
  resolve to the same Slack ID via email, so the dedupe is safe — but if
  you ever group by name instead of email, you'll double-count.
- **Multiple tags on one commit** (hotfix re-tagging): `git describe` picks
  the most recent, which is what you want for "what's unreleased".

## Related skills

- `gitlab-create-merge-request` — complementary; opens the MR that eventually
  lands on `master` and becomes a commit this skill will surface later.
