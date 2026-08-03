import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runConnectorBridgeTool } from "../claude-connector-bridge/ask-claude-code-for-connector.js";

/**
 * Gives Pi read access to Slack by borrowing Claude Code's Slack connector session.
 *
 * mcp.slack.com advertises no OAuth registration endpoint, so only a pre-registered
 * client (Claude Code) can authenticate. This bridge borrows that session instead of
 * registering a second Slack app in the Aircall workspace.
 *
 * Every tool here costs roughly $0.04 and 10-20 seconds per call.
 */
const server = new McpServer({
  name: "slack-via-claude",
  version: "1.0.0",
});

const SLACK_TOOL_PREFIX = "mcp__claude_ai_Slack__";

const COST_NOTE = "Costs ~$0.04 and 10-20s per call (boots a headless Claude Code session).";

/** Slack connector tools that post or mutate; denied on every read-only bridge call. */
const SLACK_WRITE_TOOLS = [
  "mcp__claude_ai_Slack__slack_send_message",
  "mcp__claude_ai_Slack__slack_send_message_draft",
  "mcp__claude_ai_Slack__slack_schedule_message",
  "mcp__claude_ai_Slack__slack_create_canvas",
  "mcp__claude_ai_Slack__slack_update_canvas",
];

server.tool(
  "slack_search_messages",
  `Search Slack messages the user can see, public and private channels included. ${COST_NOTE}`,
  {
    query: z.string().describe("Search text, e.g. 'deploy freeze' or 'from:@kento dashboard'"),
    limit: z.number().optional().default(20).describe("Maximum messages to return (default: 20)"),
  },
  ({ query, limit }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: SLACK_TOOL_PREFIX,
      connectorTool: "slack_search_public_and_private",
      writeToolsDenied: SLACK_WRITE_TOOLS,
      instruction: `Search for ${JSON.stringify(query)} and return up to ${limit} results.`,
    })
);

server.tool(
  "slack_read_channel_history",
  `Read recent messages from one Slack channel. ${COST_NOTE}`,
  {
    channel: z.string().describe("Channel name like '#eng-dashboard' or ID like 'C079E62LDCP'"),
    limit: z.number().optional().default(30).describe("Maximum messages to return (default: 30)"),
  },
  ({ channel, limit }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: SLACK_TOOL_PREFIX,
      connectorTool: "slack_read_channel",
      writeToolsDenied: SLACK_WRITE_TOOLS,
      instruction: `Read the last ${limit} messages from channel ${JSON.stringify(channel)}.`,
    })
);

server.tool(
  "slack_read_thread",
  `Read every reply in one Slack thread. ${COST_NOTE}`,
  {
    channel: z.string().describe("Channel name or ID containing the thread"),
    thread_ts: z
      .string()
      .describe("Slack timestamp of the thread's parent message, e.g. '1754236800.123456'"),
  },
  ({ channel, thread_ts }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: SLACK_TOOL_PREFIX,
      connectorTool: "slack_read_thread",
      writeToolsDenied: SLACK_WRITE_TOOLS,
      instruction: `Read the full thread ${JSON.stringify(thread_ts)} in channel ${JSON.stringify(channel)}.`,
    })
);

server.tool(
  "slack_lookup_user",
  `Find a Slack user's ID and profile from an email address or display name. ${COST_NOTE}`,
  {
    query: z.string().describe("Email address or name, e.g. 'kento.monthubert@aircall.io'"),
  },
  ({ query }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: SLACK_TOOL_PREFIX,
      connectorTool: "slack_search_users",
      writeToolsDenied: SLACK_WRITE_TOOLS,
      instruction: `Look up the Slack user matching ${JSON.stringify(query)}.`,
    })
);

server.tool(
  "slack_send_message",
  `Post a message to a Slack channel or DM immediately - this is visible to other people and cannot be unsent by this tool. ${COST_NOTE}`,
  {
    channel: z.string().describe("Channel name, channel ID, or user ID for a DM"),
    text: z.string().describe("Message body, exactly as it should appear in Slack"),
    thread_ts: z.string().optional().describe("Reply inside this thread instead of the channel root"),
  },
  ({ channel, text, thread_ts }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: SLACK_TOOL_PREFIX,
      connectorTool: "slack_send_message",
      instruction:
        `Send the message ${JSON.stringify(text)} to ${JSON.stringify(channel)}` +
        `${thread_ts ? ` as a reply in thread ${JSON.stringify(thread_ts)}` : ""}.`,
      allowWrites: true,
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
