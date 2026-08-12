import {
  askClaudeCodeForConnector,
  type BridgeContentBlock,
} from "../claude-connector-bridge/ask-claude-code-for-connector.js";
import { FIGMA_TOOL_PREFIX, FIGMA_WRITE_TOOLS } from "./figma-connector-tools.js";

/**
 * Gets Figma design context, declining Figma's Code Connect mapping prompt when it appears.
 *
 * Figma sometimes replaces the entire get_design_context payload with a script asking the
 * user whether to map unmapped components with Code Connect, returning no design at all.
 * Observed 2026-08-11 on fileKey I5gbzC4AFhYwQri6FaGeZj nodeId 16:4009: a bridge call got
 * only the script, while a call with byte-identical arguments eight minutes later got the
 * code, so no choice of arguments avoids it. A headless bridge session has no user to
 * answer the script, so the prompt is declined here the way the script itself prescribes -
 * call again with disableCodeConnect false - which keeps mapped component snippets in the
 * output. Costs one extra bridge call (~$0.04, 10-20s) on the calls that hit the prompt.
 */

/** Phrase Figma uses when it answers with the Code Connect mapping prompt instead of design context. */
const CODE_CONNECT_MAPPING_PROMPT_PHRASE = "missing code connect mappings";

export type FigmaDesignContextRequest = {
  figmaUrl: string;
  clientFrameworks?: string;
  clientLanguages?: string;
  /**
   * Whether Figma should skip Code Connect lookups. Leave unset to let this module
   * decline the mapping prompt on its own; setting it suppresses that retry, because an
   * explicit choice by the caller must not be overridden.
   */
  disableCodeConnect?: boolean;
};

/** True when Figma answered with the "Would you like to connect code components" script, not a design. */
export function isCodeConnectMappingPrompt(blocks: BridgeContentBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.type === "text" &&
      block.text.toLowerCase().includes(CODE_CONNECT_MAPPING_PROMPT_PHRASE)
  );
}

export async function fetchFigmaDesignContext(
  request: FigmaDesignContextRequest
): Promise<BridgeContentBlock[]> {
  const firstAttempt = await askFigmaForDesignContext(request);
  const callerChoseCodeConnectMode = request.disableCodeConnect !== undefined;
  if (callerChoseCodeConnectMode || !isCodeConnectMappingPrompt(firstAttempt)) return firstAttempt;

  const afterDeclining = await askFigmaForDesignContext({
    ...request,
    disableCodeConnect: false,
  });
  if (isCodeConnectMappingPrompt(afterDeclining)) {
    throw new Error(
      "Figma returned the Code Connect mapping prompt twice for this node, even after declining it " +
        "with disableCodeConnect false, so there is no design context to return. Answer the Code " +
        "Connect prompt once in an interactive Claude Code session, then retry."
    );
  }
  return [
    {
      type: "text",
      text:
        "[figma-via-claude] Figma answered with the Code Connect mapping prompt instead of the " +
        "design. Declined it and re-requested; the design context follows.",
    },
    ...afterDeclining,
  ];
}

/** Runs one get_design_context bridge call, with no prompt handling of its own. */
function askFigmaForDesignContext(
  request: FigmaDesignContextRequest
): Promise<BridgeContentBlock[]> {
  return askClaudeCodeForConnector({
    connectorToolPrefix: FIGMA_TOOL_PREFIX,
    connectorTool: "get_design_context",
    writeToolsDenied: FIGMA_WRITE_TOOLS,
    instruction: buildDesignContextInstruction(request),
  });
}

/** Spells out the tool arguments in plain words, because the subprocess model types the call. */
export function buildDesignContextInstruction(request: FigmaDesignContextRequest): string {
  const args = [`Use the Figma URL ${JSON.stringify(request.figmaUrl)}`];
  if (request.clientFrameworks) {
    args.push(`clientFrameworks ${JSON.stringify(request.clientFrameworks)}`);
  }
  if (request.clientLanguages) {
    args.push(`clientLanguages ${JSON.stringify(request.clientLanguages)}`);
  }
  if (request.disableCodeConnect !== undefined) {
    args.push(`disableCodeConnect ${request.disableCodeConnect} as a boolean, not a string`);
  }
  return `${args.join(", ")}.`;
}
