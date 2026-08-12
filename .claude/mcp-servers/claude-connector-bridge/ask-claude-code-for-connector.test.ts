import { expect, test } from "bun:test";
import { extractConnectorToolResult } from "./ask-claude-code-for-connector.js";

const FIGMA_PREFIX = "mcp__claude_ai_Figma__";

function toolUse(id: string, name: string) {
  return { type: "assistant", message: { content: [{ type: "tool_use", id, name }] } };
}

function toolResult(toolUseId: string, text: string) {
  return {
    type: "user",
    message: {
      content: [{ type: "tool_result", tool_use_id: toolUseId, content: [{ type: "text", text }] }],
    },
  };
}

test("returns the last result when the connector tool was called twice", () => {
  const blocks = extractConnectorToolResult(
    [
      toolUse("t1", "ToolSearch"),
      toolResult("t1", "tool reference"),
      toolUse("t2", "mcp__claude_ai_Figma__get_design_context"),
      toolResult("t2", "missing code connect mappings"),
      toolUse("t3", "mcp__claude_ai_Figma__get_design_context"),
      toolResult("t3", "the actual design context"),
    ],
    FIGMA_PREFIX,
    "get_design_context"
  );
  expect(blocks).toEqual([{ type: "text", text: "the actual design context" }]);
});

test("ignores results from tools other than the requested one", () => {
  const blocks = extractConnectorToolResult(
    [
      toolUse("t1", "ToolSearch"),
      toolResult("t1", "tool reference"),
      toolUse("t2", "mcp__claude_ai_Figma__get_design_context"),
      toolResult("t2", "the actual design context"),
    ],
    FIGMA_PREFIX,
    "get_design_context"
  );
  expect(blocks).toEqual([{ type: "text", text: "the actual design context" }]);
});

test("names the wrong tool when the subprocess called a sibling connector tool", () => {
  expect(() =>
    extractConnectorToolResult(
      [
        toolUse("t1", "mcp__claude_ai_Figma__get_metadata"),
        toolResult("t1", "<xml/>"),
        { type: "result", subtype: "success", result: "done" },
      ],
      FIGMA_PREFIX,
      "get_design_context"
    )
  ).toThrow(/never reached mcp__claude_ai_Figma__get_design_context.*get_metadata instead/s);
});

test("passes image blocks through", () => {
  const blocks = extractConnectorToolResult(
    [
      toolUse("t1", "mcp__claude_ai_Figma__get_screenshot"),
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t1",
              content: [{ type: "image", data: "iVBOR", mimeType: "image/png" }],
            },
          ],
        },
      },
    ],
    FIGMA_PREFIX,
    "get_screenshot"
  );
  expect(blocks).toEqual([{ type: "image", data: "iVBOR", mimeType: "image/png" }]);
});
