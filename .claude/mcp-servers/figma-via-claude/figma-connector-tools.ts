/** Tool-name facts about the claude.ai Figma connector, shared by this server's modules. */

/** Prefix every claude.ai Figma connector tool name carries inside a Claude Code session. */
export const FIGMA_TOOL_PREFIX = "mcp__claude_ai_Figma__";

/** Figma connector tools that create or modify Figma content, or write files locally. */
export const FIGMA_WRITE_TOOLS = [
  "mcp__claude_ai_Figma__use_figma",
  "mcp__claude_ai_Figma__create_new_file",
  "mcp__claude_ai_Figma__upload_assets",
  "mcp__claude_ai_Figma__download_assets",
  "mcp__claude_ai_Figma__generate_diagram",
  "mcp__claude_ai_Figma__export_video",
  "mcp__claude_ai_Figma__add_code_connect_map",
  "mcp__claude_ai_Figma__send_code_connect_mappings",
];
