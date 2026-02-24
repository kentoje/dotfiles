import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { stagingAuth } from "./tools/staging-auth.js";

const server = new McpServer({
  name: "aircall-personal-tools",
  version: "1.0.0",
});

server.tool(
  "aircall_staging_auth_token",
  "Fetch a fresh JWT token from Aircall staging environment. Returns accessToken and refreshToken.",
  {},
  stagingAuth
);

const transport = new StdioServerTransport();
await server.connect(transport);
