import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { persistBrowserAuth } from "./tools/persist-browser-auth.js";

const server = new McpServer({
  name: "aircall-personal-tools",
  version: "1.0.0",
});

server.tool(
  "aircall_persist_browser_auth",
  "Persist Aircall staging auth cookies as a browser state file for use with agent-browser. Pass the target URL to scope cookies to the correct domain.",
  {
    url: z
      .string()
      .url()
      .describe(
        "Target URL (e.g. http://localhost:3000). Domain is extracted for cookie scoping."
      ),
  },
  persistBrowserAuth
);

const transport = new StdioServerTransport();
await server.connect(transport);
