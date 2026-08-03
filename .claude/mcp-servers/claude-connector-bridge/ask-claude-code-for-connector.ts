import { spawn } from "child_process";
import { readFileSync } from "fs";

/**
 * Runs one claude.ai connector tool by driving a headless `claude -p` subprocess.
 *
 * Shared by every `*-via-claude` MCP server. Claude.ai connectors (Slack, Figma,
 * Atlassian...) are account-level, bound to Anthropic-registered OAuth clients, so
 * no other agent can authenticate against them - Slack advertises no registration
 * endpoint at all, and Figma's returns 403 for clients outside its MCP catalog.
 * Borrowing the Claude Code session is the only way to reach them from Pi.
 *
 * Costs roughly $0.04 and 10-20 seconds per call, because every call boots a fresh
 * Claude Code session. Treat it as an expensive RPC, not a cheap lookup.
 */

const CLAUDE_BIN = "/Users/kento/.local/bin/claude";

/** Runs the subprocess from a git repo, because fff-mcp fails to init when cwd is $HOME. */
const BRIDGE_CWD = "/Users/kento/dotfiles";

/**
 * Ceiling on returned characters. A 20-result Slack search really does return ~110k
 * characters, and Pi hands the whole tool result to the model.
 */
const MAX_RESULT_CHARS = 40_000;

/**
 * Tools that let the subprocess act outside the connector it was asked about.
 *
 * `--allowed-tools` is NOT enforced for connector tools in this Claude Code build
 * (verified 2026-08-03: allowing only slack_search_users still permitted
 * slack_search_public). `--disallowed-tools` IS enforced - the denied tool
 * disappears from the session tool list - but denying Bash alone is escapable,
 * because the agent spawns an Agent subagent that still has Bash. Agent and Task
 * must be denied for the rest of the deny list to mean anything.
 */
const NON_CONNECTOR_TOOLS_DENIED = [
  "Agent",
  "Task",
  "Workflow",
  "Skill",
  "Bash",
  "Read",
  "Write",
  "Edit",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "CronCreate",
  "CronDelete",
  "RemoteTrigger",
  "SendMessage",
  "Monitor",
  "LSP",
  "DesignSync",
  "PushNotification",
  "ScheduleWakeup",
  "EnterWorktree",
  "ExitWorktree",
  "ShareOnboardingGuide",
];

export type ConnectorBridgeRequest = {
  /** Full connector tool prefix, e.g. "mcp__claude_ai_Figma__". */
  connectorToolPrefix: string;
  /** Connector tool to invoke, without the prefix. */
  connectorTool: string;
  /** Plain-words instruction naming the tool and its arguments. */
  instruction: string;
  /** Connector tools that post or mutate; denied unless this call is the write path. */
  writeToolsDenied?: string[];
  /** Set true only on a write path, which needs its own tool left enabled. */
  allowWrites?: boolean;
  timeoutMs?: number;
};

export type BridgeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

type ClaudeStreamMessage = {
  type: string;
  subtype?: string;
  message?: { content?: Array<Record<string, unknown>> };
  result?: string;
};

/** Strips the "no stdin data received" warning Claude Code prints before its JSON. */
function parseClaudeJsonOutput(raw: string): ClaudeStreamMessage[] {
  const start = raw.indexOf("[");
  if (start === -1) {
    throw new Error(`Connector bridge got no JSON from claude -p: ${raw.slice(0, 400)}`);
  }
  return JSON.parse(raw.slice(start));
}

/** Trims oversized payloads and says so, rather than silently flooding the caller. */
function capTextSize(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) return text;
  return (
    text.slice(0, MAX_RESULT_CHARS) +
    `\n\n[claude-connector-bridge truncated ${text.length - MAX_RESULT_CHARS} of ${text.length} characters. ` +
    `Narrow the request to see the rest.]`
  );
}

/**
 * Returns the connector tool's own output, never the subprocess model's prose summary.
 *
 * Pairs tool_use ids with tool_result blocks so the ToolSearch call that always
 * precedes the connector call cannot be mistaken for the answer. Large results are
 * spilled to a file by Claude Code, so the saved path is followed and read here
 * rather than leaving the subprocess to read it (Read is denied on purpose).
 * Image blocks are passed through, so screenshot tools keep working.
 */
function extractConnectorToolResult(
  messages: ClaudeStreamMessage[],
  connectorToolPrefix: string
): BridgeContentBlock[] {
  const connectorToolUseIds = new Set<string>();
  for (const message of messages) {
    if (message.type !== "assistant") continue;
    for (const block of message.message?.content ?? []) {
      if (block.type === "tool_use" && String(block.name).startsWith(connectorToolPrefix)) {
        connectorToolUseIds.add(String(block.id));
      }
    }
  }

  for (const message of messages) {
    if (message.type !== "user") continue;
    for (const block of message.message?.content ?? []) {
      if (block.type !== "tool_result") continue;
      if (!connectorToolUseIds.has(String(block.tool_use_id))) continue;
      return renderToolResultContent(block.content);
    }
  }

  const finalMessage = messages.find((m) => m.type === "result");
  throw new Error(
    `Connector bridge never reached ${connectorToolPrefix} (subtype=${finalMessage?.subtype}). ` +
      `Subprocess said: ${String(finalMessage?.result).slice(0, 300)}`
  );
}

function renderToolResultContent(content: unknown): BridgeContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: followSpillPath(content) }];
  if (!Array.isArray(content)) return [{ type: "text", text: String(content ?? "") }];

  const blocks: BridgeContentBlock[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      blocks.push({ type: "text", text: followSpillPath(part) });
      continue;
    }
    const record = part as {
      type?: string;
      text?: string;
      data?: string;
      mimeType?: string;
      source?: { data?: string; media_type?: string };
    };

    // Image blocks arrive either flat (MCP shape: {data, mimeType}) or nested
    // (Anthropic API shape: {source: {data, media_type}}); accept both, and never
    // pass base64 through followSpillPath, which would truncate it into garbage.
    if (record.type === "image") {
      const data = record.source?.data ?? record.data;
      if (data) {
        blocks.push({
          type: "image",
          data,
          mimeType: record.source?.media_type ?? record.mimeType ?? "image/png",
        });
        continue;
      }
    }

    if (record.text !== undefined) {
      blocks.push({ type: "text", text: followSpillPath(record.text) });
      continue;
    }

    // Never drop a block silently - an unrecognised shape must be diagnosable.
    blocks.push({
      type: "text",
      text: `[claude-connector-bridge could not render a tool_result block of type ${JSON.stringify(record.type)}; keys: ${Object.keys(record).join(", ")}]`,
    });
  }
  return blocks.length > 0 ? blocks : [{ type: "text", text: "" }];
}

/** Claude Code spills oversized tool results to disk; read the file it names. */
function followSpillPath(text: string): string {
  const spilled = text.match(/Output has been saved to (\S+)/);
  if (!spilled) return capTextSize(text);
  return capTextSize(readFileSync(spilled[1].replace(/[.,]$/, ""), "utf-8"));
}

export async function askClaudeCodeForConnector(
  request: ConnectorBridgeRequest
): Promise<BridgeContentBlock[]> {
  const denied = request.allowWrites
    ? NON_CONNECTOR_TOOLS_DENIED
    : [...NON_CONNECTOR_TOOLS_DENIED, ...(request.writeToolsDenied ?? [])];

  const prompt =
    `Call the MCP tool ${request.connectorToolPrefix}${request.connectorTool} exactly once. ` +
    `${request.instruction} ` +
    `Do not summarise, reformat, or comment on the result - the caller reads the raw tool output directly.`;

  const args = [
    "-p",
    prompt,
    "--model",
    "haiku",
    "--output-format",
    "json",
    "--max-turns",
    "4",
    "--disallowed-tools",
    ...denied,
  ];

  const timeoutMs = request.timeoutMs ?? 180_000;
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd: BRIDGE_CWD, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Connector bridge timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Connector bridge could not spawn claude: ${error.message}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(stdout || stderr);
    });
  });

  return extractConnectorToolResult(parseClaudeJsonOutput(raw), request.connectorToolPrefix);
}

/** Wraps a bridge call in the MCP content envelope, surfacing failures as tool errors. */
export async function runConnectorBridgeTool(request: ConnectorBridgeRequest) {
  try {
    return { content: await askClaudeCodeForConnector(request) };
  } catch (error) {
    return {
      content: [
        { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
      ],
      isError: true,
    };
  }
}
