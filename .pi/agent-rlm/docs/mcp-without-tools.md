# MCP servers without MCP tools

RLM deactivates every MCP tool. The local servers are Bun scripts whose tool bodies are
exported functions, so import the function and skip the protocol entirely.

| Capability | Import from `process.env.HOME + ...` | Export |
| --- | --- | --- |
| Aircall staging browser auth | `/.claude/mcp-servers/aircall-personal-tools/tools/persist-agent-browser-auth.ts` | `persistAgentBrowserAuth({ url })` |
| Figma, Slack, and other claude.ai connectors | `/.claude/mcp-servers/claude-connector-bridge/ask-claude-code-for-connector.ts` | `askClaudeCodeForConnector(request)` |
| Video frame extraction | `/.claude/mcp-servers/video-to-frames/tools/extract-frames.ts` | see file |

## Connectors

`askClaudeCodeForConnector` shells out to `claude -p` and returns the connector's raw
content blocks, so it is slow - one Claude Code session per call. Batch what you need
into a single instruction.

```ts
const { askClaudeCodeForConnector } = await import(
  process.env.HOME + "/.claude/mcp-servers/claude-connector-bridge/ask-claude-code-for-connector.ts"
);
const blocks = await askClaudeCodeForConnector({
  connectorToolPrefix: "mcp__claude_ai_Slack__",
  connectorTool: "slack_search_messages",
  instruction: "Search for messages about the release in #eng, limit 10.",
});
```

Writes are denied unless the call sets `allowWrites: true`.

## Atlassian

The one real gap: a remote OAuth MCP server with no importable body.

- Jira: the `jira` CLI.
- Confluence: the REST API with `$JIRA_API_TOKEN` and the account email as basic auth.

## Code search

`fff` is an MCP server here but also a binary, so use ripgrep-style CLI calls or the
mounted `tools.grep` / `tools.find` instead.
