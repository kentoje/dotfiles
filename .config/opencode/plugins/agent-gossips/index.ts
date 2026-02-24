import type { Plugin } from "@opencode-ai/plugin";

const SYNC_URL = "http://localhost:4000/sync";

type SessionState =
  | "idle"
  | "running"
  | "waiting_for_permission"
  | "waiting_for_answer"
  | "retry"
  | "terminated";

/**
 * Map an OpenCode plugin event to a unified session state.
 * Returns null if the event is not relevant for state tracking.
 */
function deriveState(event: { type: string; properties: Record<string, unknown> }): SessionState | null {
  switch (event.type) {
    case "session.created":
    case "session.idle":
      return "idle";

    case "session.deleted":
      return "terminated";

    case "session.status": {
      const status = event.properties.status as { type?: string } | undefined;
      if (status?.type === "busy") return "running";
      if (status?.type === "idle") return "idle";
      if (status?.type === "retry") return "retry";
      return null;
    }

    case "permission.asked":
      return "waiting_for_permission";

    case "question.asked":
      return "waiting_for_answer";

    default:
      return null;
  }
}

/**
 * Extract session ID from an OpenCode event.
 * session.created / session.deleted store it in properties.info.id;
 * all other events use properties.sessionID.
 */
function extractSessionId(event: { type: string; properties: Record<string, unknown> }): string | null {
  if (event.type === "session.created" || event.type === "session.deleted") {
    const info = event.properties.info as { id?: string } | undefined;
    return info?.id ?? null;
  }
  const sid = event.properties.sessionID;
  return typeof sid === "string" ? sid : null;
}

/**
 * Send a sync payload to the agent-gossips server.
 * Errors are silently swallowed to avoid disrupting OpenCode.
 */
async function sync(payload: {
  pid: number;
  session_id: string;
  state: SessionState;
  directory: string;
  source: string;
}): Promise<void> {
  try {
    await fetch(SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // silent — the gossip server may be down
  }
}

/**
 * agent-gossips plugin for OpenCode.
 *
 * Uses the plugin context (directory) and event data to send
 * authoritative state updates to the agent-gossips server via POST /sync.
 * The server deduplicates by PID: only one session per OpenCode process.
 */
export const plugin: Plugin = async ({ directory }) => {
  const pid = process.pid;

  return {
    event: async ({ event }) => {
      const state = deriveState(event as { type: string; properties: Record<string, unknown> });
      if (state === null) return;

      const sessionId = extractSessionId(event as { type: string; properties: Record<string, unknown> });
      if (!sessionId) return;

      await sync({
        pid,
        session_id: sessionId,
        state,
        directory,
        source: "opencode",
      });
    },
  };
};
