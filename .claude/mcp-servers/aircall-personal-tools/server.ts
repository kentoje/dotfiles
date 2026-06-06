import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { persistAgentBrowserAuth } from "./tools/persist-agent-browser-auth.js";

const server = new McpServer({
  name: "aircall-personal-tools",
  version: "1.0.0",
});

server.tool(
  "aircall_agent_browser_auth",
  "Authenticate Aircall staging for agent-browser. Sets auth cookies directly in the agent-browser session via CLI. Use this when automating with the agent-browser skill.",
  {
    url: z
      .string()
      .url()
      .describe(
        "Target URL (e.g. http://localhost:3000). Domain is extracted for cookie scoping.",
      ),
  },
  persistAgentBrowserAuth,
);

// server.tool(
//   "aircall_cdp_auth",
//   "Authenticate Aircall staging for Chrome DevTools Protocol (chrome-devtools-mcp). Returns a document.cookie JS snippet to run via evaluate_script. Use this when automating with the chrome-devtools-mcp skill.",
//   {
//     url: z
//       .string()
//       .url()
//       .describe(
//         "Target URL (e.g. http://localhost:3000). Domain is extracted for cookie scoping.",
//       ),
//   },
//   persistCdpAuth,
// );

const transport = new StdioServerTransport();
await server.connect(transport);
