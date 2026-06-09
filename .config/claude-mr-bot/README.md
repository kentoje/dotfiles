# claude-mr-approver

A **tightly restricted** Claude that watches one Slack channel and auto-approves
**low-risk** GitLab MRs requested there. It can only: read Slack (company
`claude.ai Slack` connector), read GitLab MRs via `glab`, add a GitLab approval,
and post a Slack reply. It **cannot** merge, push, edit files, fetch the web,
read local files, or call `glab api`.

## How the restriction is enforced
Because the bot uses the **company claude.ai Slack connector** (authenticated in
your main `~/.claude`), it must run in your default config — so `--strict-mcp-config`
and an isolated config dir are NOT usable (they'd drop the connector). Restriction
is therefore done purely with tool lists, in `claude-mr-approver.fish`:

- `--allowedTools` — whitelist: `mcp__claude_ai_Slack` (Slack-only connector) +
  read-only `glab` (`mr view/diff/list`, `ci`) + `glab mr approve` + `jq`.
- `--disallowedTools` — deny wins over allow. Explicitly kills the read-only
  built-ins that are **auto-allowed by default** (`Read`, `Glob`, `Grep`) plus
  `Edit`/`Write`/`NotebookEdit`, `WebFetch`/`WebSearch`, `Task`/`Agent`, and
  `glab api`. Without this denylist, `Read`/`Glob`/`Grep` would NOT be blocked.
- `--permission-mode default` (NOT skip-permissions) — in headless `-p`, any tool
  that isn't whitelisted and needs permission is auto-denied (every other MCP
  server, arbitrary Bash, etc.).
- `policy.md` — injected as the system prompt: the low-risk gate + behavior.

Net: the only state-mutating capability the bot has is `glab mr approve`.

## Setup
1. **GitLab** — already done (`glab auth status` shows gitlab.com logged in).
2. **Slack** — already done: the `claude.ai Slack` connector shows `✔ connected`.
3. **Channel** — add to `~/dotfiles/.config/fish/includes/private-vars.fish`:
   ```fish
   set -gx MR_BOT_SLACK_CHANNEL "#mr-approvals"   # channel name or id to watch + reply in
   ```

## Verify (run in YOUR shell — auth/connector can't be tested from a sandbox)
Confirms the connector survives headless `-p` and the denylist works:
```fish
claude -p "List which Slack (mcp__claude_ai_Slack) tools you have, and say whether the Read tool is permitted or denied. Do not post anything." \
  --model sonnet --permission-mode default \
  --allowedTools "mcp__claude_ai_Slack" \
  --disallowedTools "Read" "WebFetch"
```
Expect: Slack tools listed, Read reported as denied. **If the connector is missing
in `-p`**, claude.ai connectors sometimes don't load headless — fall back to a
stdio Slack MCP server (see git history of this dir for that variant).

## Run
```fish
claude-mr-approver   # or the abbr: cmra
```
Polls every 60s. A `state/last_ts` cursor in `~/.local/share/claude-mr-bot`
prevents reprocessing. Ctrl-C to stop. Model defaults to `sonnet` (edit the
function to change). Tune the low-risk bar in `policy.md`.

## Safety notes
- Approval identity is **your** GitLab user (`GITLAB_TOKEN`) — the gate is strict
  and refuses on any uncertainty (a false 🟡 is harmless; a false ✅ is not).
- The bot approves **at most** the MRs explicitly requested in the channel per poll.
- For a cautious first run, drop `Bash(glab mr approve:*)` from `allowed` and tell
  `policy.md` to only post its verdict — watch its judgment before enabling approval.
