# Harness retrospective in Pi

Run `/harness-retro` to review the current Pi session. The command proposes improvements from observed harness tool failures and repeated read operations, with stable session entry references. It matches the affected tool's contract obligations and saves new proposals as drafts in `docs/backlog.md`.

- `/harness-retro review {"dry_run":true}` previews proposals.
- `/harness-retro review {"session_id":"…","focus":"mr"}` selects a saved session from the current Pi session directory and filters proposal titles.
- `/harness-retro list {"state":"proposed"}` lists matching backlog items.
- `/harness-retro record {"title":"…","evidence":["pi:session/entry"],"proposed_behavior":"…"}` records an operator proposal.

An exact title match after Unicode, whitespace and case normalization links the existing HBR item. The backlog is Markdown with one versioned JSON block. Lock conflicts can be retried. Malformed content is preserved and reported. Proposal review uses the cited operation and structured outcome code, keeping raw transcript text out of automatically generated records.

[Behavior contract](../../contracts/retrospective/intent.md) · [Action schema](definition.json)
