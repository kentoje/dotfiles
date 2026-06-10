---
name: ping-me-slack
description: >
  Ping Kento on Slack (DM) when a task is fully ready / complete. Use when the
  user says "ping me on slack when ready/done", "slack me when this finishes",
  or asks to be notified on Slack after a long-running task, build, or review
  completes.
---

# Ping Me on Slack

Send a Slack DM to Kento when work is **fully ready** — task complete, build
green, PR mergeable, review done. This is the "I'm finished, come look" signal.

## Target

| Field      | Value          | Notes                                       |
| ---------- | -------------- | ------------------------------------------- |
| Channel ID | `D02HB6U23N0`  | Kento's DM (Slackbot/self DM). IDs starting with `D` are direct messages. |

Source: https://aircall.slack.com/archives/D02HB6U23N0

## Precondition

- Slack MCP (`mcp__claude_ai_Slack__*`) must be authenticated. If a call fails
  with an auth error, run `mcp__claude_ai_Slack__authenticate` first, then retry.

## When to fire

Only ping when the work is **genuinely done and verified** — not at the start,
not mid-progress. "Fully ready" means:

- The requested task is complete, AND
- Any checks the user cares about pass (tests/build/lint), AND
- There is nothing left blocking the user from taking the next step.

If the task ended in failure or is blocked, still ping — but say so clearly so
the user knows it needs attention rather than expecting success.

## Steps

### 1. Compose a short status line

One line, scannable on a phone lock screen. Lead with a status glyph:

- `✅` — done and verified
- `⚠️` — done but with caveats / needs a look
- `❌` — failed or blocked, needs attention

Include the concrete result, not just "done":

- `✅ release-ping skill created — tests 12/12 green, ready to merge`
- `⚠️ migration applied — 1 row skipped, check logs`
- `❌ build failed — TS error in src/index.ts:42`

### 2. Send the DM

```
mcp__claude_ai_Slack__slack_send_message(
  channel_id: "D02HB6U23N0",
  message: "<status line>"
)
```

### 3. Confirm

Report back the `message_ts` so the user knows it landed, and so a follow-up
can be threaded with `thread_ts` if needed.

## Notes

- Keep it to one line. This is a notification, not a report — the detail lives
  in the chat session the user is returning to.
- Do **not** ask for confirmation before sending. When this skill is invoked
  the user has already opted in to being pinged; sending silently is the point.
- If the user asked to be pinged "when ready" at the *start* of a long task,
  hold the ping until the work is actually complete — then fire it.

## Related skills

- `notify` — lighter-weight ntfy.sh push when a Slack DM is overkill.
- `release-ping-dashboard` — pings *other* people (commit authors) for sign-off,
  using the same Slack MCP.
