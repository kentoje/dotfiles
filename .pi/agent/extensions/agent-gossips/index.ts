import type { ExtensionAPI, UIPromptKind } from "@earendil-works/pi-coding-agent";

const AGENT_GOSSIPS_EVENTS_URL = "http://127.0.0.1:4000/events";
const AGENT_GOSSIPS_HEARTBEAT_MS = 15_000;
const AGENT_GOSSIPS_TIMEOUT_MS = 1_000;

type PiGossipState = "idle" | "running" | "waiting_for_permission" | "waiting_for_answer" | "terminated";
type PiGossipSession = { id: string; directory: string };

/** Reports interactive Pi agent status to agent-gossip and SketchyBar without sending conversation content. */
export default function installPiGossipExtension(pi: ExtensionAPI): void {
  let session: PiGossipSession | undefined;
  let agentActive = false;
  const prompts: UIPromptKind[] = [];
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let requestQueue = Promise.resolve();

  function reportState(eventType: string, state: PiGossipState): Promise<void> {
    if (!session) return requestQueue;
    const payload = {
      session_id: session.id,
      directory: session.directory,
      pid: process.pid,
      source: "pi",
      event_type: eventType,
      state,
    };
    requestQueue = requestQueue.then(async () => {
      try {
        const response = await fetch(AGENT_GOSSIPS_EVENTS_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(AGENT_GOSSIPS_TIMEOUT_MS),
        });
        await response.body?.cancel();
      } catch {
        // Best-effort telemetry must not fail a turn when the local server is down.
      }
    });
    return requestQueue;
  }

  function reportActivity(eventType: string): Promise<void> {
    const prompt = prompts.at(-1);
    const state = prompt
      ? prompt === "confirm" ? "waiting_for_permission" : "waiting_for_answer"
      : agentActive ? "running" : "idle";
    return reportState(eventType, state);
  }

  function stopHeartbeat(): void {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  }

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    stopHeartbeat();
    const id = ctx.sessionManager.getSessionId();
    if (session && session.id !== id) void reportState("session_end", "terminated");
    session = { id, directory: ctx.cwd };
    agentActive = !ctx.isIdle();
    prompts.length = 0;
    // Namespacing avoids the server's legacy session_start cleanup, which evicts
    // other live agents in the same directory. PID cleanup handles dead Pi sessions.
    void reportActivity("pi.session_start");
    heartbeat = setInterval(() => {
      void reportActivity("pi.heartbeat");
    }, AGENT_GOSSIPS_HEARTBEAT_MS);
    heartbeat.unref();
  });

  pi.on("agent_start", () => {
    agentActive = true;
    void reportActivity("pi.agent_start");
  });

  // agent_end can precede an automatic retry, compaction, or queued continuation.
  pi.on("agent_settled", () => {
    agentActive = false;
    prompts.length = 0;
    void reportActivity("pi.agent_settled");
  });

  pi.on("ui_prompt_start", (event) => {
    prompts.push(event.kind);
    void reportActivity("pi.ui_prompt_start");
  });

  pi.on("ui_prompt_end", (event) => {
    const index = prompts.lastIndexOf(event.kind);
    if (index !== -1) prompts.splice(index, 1);
    void reportActivity("pi.ui_prompt_end");
  });

  pi.on("session_shutdown", async () => {
    stopHeartbeat();
    const pending = reportState("session_end", "terminated");
    session = undefined;
    await pending;
  });
}
