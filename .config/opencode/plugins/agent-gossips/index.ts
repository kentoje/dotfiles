import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";

const SERVER_URL = "http://localhost:4000/events";
const LOG_FILE = "/tmp/agent-gossips.log";

// /Volumes/HomeX/kento/dotfiles/.config/opencode/plugins/agent-gossips/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts
// Events do not work as expected. Maybe we can spy on PIDs, and attach the PID to the latest session with matching DIR.
// When we lose a PID, we can delete the attached session.
const EVENTS = new Set([
  "permission.asked",
  "question.asked",
  "session.idle",
  "session.created",
  "session.deleted",
  "session.status",
  // "server.instance.disposed",
]);

/**
 * Send raw event to the gossip server
 */
async function sendEvent(event: unknown): Promise<void> {
  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
  } catch {
    // const message = error instanceof Error ? error.message : String(error);
    // console.error(`[agent-gossips] Failed to send ${eventType}:`, message);
  }
}

export const plugin: Plugin = async () => {
  return {
    event: async ({ event }) => {
      fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`);

      if (!EVENTS.has(event.type)) {
        return;
      }

      await sendEvent(event);
    },
  };
};
