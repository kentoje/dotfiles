import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  runConnectorBridgeTool,
  toMcpToolResult,
} from "../claude-connector-bridge/ask-claude-code-for-connector.js";
import { fetchFigmaDesignContext } from "./fetch-figma-design-context.js";
import { FIGMA_TOOL_PREFIX, FIGMA_WRITE_TOOLS } from "./figma-connector-tools.js";

/**
 * Gives Pi read access to Figma by borrowing Claude Code's Figma connector session.
 *
 * Figma's remote MCP server only accepts clients in the Figma MCP Catalog (VS Code,
 * Cursor, Claude Code...); registration returns 403 for anything else, so Pi cannot
 * connect directly. The alternative is Figma's desktop server on 127.0.0.1:3845,
 * which needs the app open and a Dev/Full seat.
 *
 * Every tool here costs roughly $0.04 and 10-20 seconds per call.
 */
const server = new McpServer({
  name: "figma-via-claude",
  version: "1.0.0",
});

const COST_NOTE = "Costs ~$0.04 and 10-20s per call (boots a headless Claude Code session).";

const figmaUrl = z
  .string()
  .describe(
    "Figma link to a file or a selected node, e.g. https://www.figma.com/design/<key>/<name>?node-id=1-23 " +
      "(right click a layer in Figma and choose 'Copy link to selection')"
  );

server.tool(
  "figma_get_design_context",
  `Get the design context for a Figma node: structure, styles, and generated markup, for implementing it in code. ${COST_NOTE} Rarely costs a second call, when Figma's Code Connect mapping prompt has to be declined.`,
  {
    figma_url: figmaUrl,
    client_frameworks: z
      .string()
      .optional()
      .describe("Target frameworks, e.g. 'react,tailwind' - shapes the generated markup"),
    client_languages: z.string().optional().describe("Target languages, e.g. 'typescript,css'"),
    disable_code_connect: z
      .boolean()
      .optional()
      .describe(
        "Leave unset. Set true only to skip Code Connect entirely, which drops the mapped " +
          "codebase component snippets from the output; Figma's Code Connect mapping prompt is " +
          "already declined automatically."
      ),
  },
  ({ figma_url, client_frameworks, client_languages, disable_code_connect }) =>
    toMcpToolResult(() =>
      fetchFigmaDesignContext({
        figmaUrl: figma_url,
        clientFrameworks: client_frameworks,
        clientLanguages: client_languages,
        disableCodeConnect: disable_code_connect,
      })
    )
);

server.tool(
  "figma_get_screenshot",
  `Get a rendered image of a Figma node, to compare a design against an implementation. ${COST_NOTE}`,
  { figma_url: figmaUrl },
  ({ figma_url }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: FIGMA_TOOL_PREFIX,
      connectorTool: "get_screenshot",
      writeToolsDenied: FIGMA_WRITE_TOOLS,
      instruction: `Use the Figma URL ${JSON.stringify(figma_url)}.`,
    })
);

server.tool(
  "figma_get_metadata",
  `Get the layer tree of a Figma node - names, types, sizes, positions - without the full design context. Cheaper than design context for orienting in a file. ${COST_NOTE}`,
  { figma_url: figmaUrl },
  ({ figma_url }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: FIGMA_TOOL_PREFIX,
      connectorTool: "get_metadata",
      writeToolsDenied: FIGMA_WRITE_TOOLS,
      instruction: `Use the Figma URL ${JSON.stringify(figma_url)}.`,
    })
);

server.tool(
  "figma_get_variable_defs",
  `Get the Figma variables and design tokens used by a node - colors, spacing, typography - with their names and values. ${COST_NOTE}`,
  { figma_url: figmaUrl },
  ({ figma_url }) =>
    runConnectorBridgeTool({
      connectorToolPrefix: FIGMA_TOOL_PREFIX,
      connectorTool: "get_variable_defs",
      writeToolsDenied: FIGMA_WRITE_TOOLS,
      instruction: `Use the Figma URL ${JSON.stringify(figma_url)}.`,
    })
);

server.tool(
  "figma_whoami",
  `Check which Figma account the bridge is authenticated as. Use this to confirm the bridge works before a longer request. ${COST_NOTE}`,
  {},
  () =>
    runConnectorBridgeTool({
      connectorToolPrefix: FIGMA_TOOL_PREFIX,
      connectorTool: "whoami",
      writeToolsDenied: FIGMA_WRITE_TOOLS,
      instruction: "It takes no arguments.",
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
