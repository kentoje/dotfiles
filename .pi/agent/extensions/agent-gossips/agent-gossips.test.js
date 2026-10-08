import { afterEach, expect, mock, test } from "bun:test";
import installPiGossipExtension from "./index.ts";

const originalFetch = globalThis.fetch;
const disposals = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
  globalThis.fetch = originalFetch;
});

function createPiGossipHarness({ mode = "tui", idle = true, sessionId = "pi-first" } = {}) {
  const handlers = new Map();
  const events = [];
  globalThis.fetch = mock(async (_url, options) => {
    events.push(JSON.parse(options.body));
    return new Response("{}", { status: 200 });
  });
  const context = {
    mode,
    cwd: "/tmp/pi-gossip-project",
    isIdle: () => idle,
    sessionManager: { getSessionId: () => sessionId },
  };
  installPiGossipExtension({
    on: (name, handler) => handlers.set(name, handler),
  });
  async function emit(name, event = {}) {
    await handlers.get(name)?.(event, context);
    await new Promise(setImmediate);
  }
  disposals.push(() => emit("session_shutdown"));
  return { events, emit, setSessionId: (id) => { sessionId = id; } };
}

test("registers interactive Pi sessions and settles only at the final boundary", async () => {
  const { events, emit } = createPiGossipHarness();
  await emit("session_start");
  await emit("agent_start");
  await emit("agent_end");
  expect(events.map((event) => event.state)).toEqual(["idle", "running"]);
  await emit("agent_settled");
  expect(events.map((event) => event.state)).toEqual(["idle", "running", "idle"]);
  expect(events[0]).toMatchObject({
    source: "pi", session_id: "pi-first", pid: process.pid,
    directory: "/tmp/pi-gossip-project", event_type: "pi.session_start",
  });
});

test.each(["rpc", "json", "print"])("does not register %s child sessions", async (mode) => {
  const { events, emit } = createPiGossipHarness({ mode });
  await emit("session_start");
  await emit("agent_start");
  await emit("agent_settled");
  expect(events).toEqual([]);
});

test("restores working state on a reload during an active turn", async () => {
  const { events, emit } = createPiGossipHarness({ idle: false });
  await emit("session_start", { reason: "reload" });
  expect(events[0].state).toBe("running");
});

test("reports nested permission and answer prompts, then restores activity", async () => {
  const { events, emit } = createPiGossipHarness({ idle: false });
  await emit("session_start");
  await emit("ui_prompt_start", { kind: "confirm" });
  await emit("ui_prompt_start", { kind: "custom" });
  await emit("ui_prompt_end", { kind: "custom" });
  await emit("ui_prompt_end", { kind: "confirm" });
  expect(events.map((event) => event.state)).toEqual([
    "running", "waiting_for_permission", "waiting_for_answer", "waiting_for_permission", "running",
  ]);
});

test("closes a replaced session and preserves ordered reporting", async () => {
  const { events, emit, setSessionId } = createPiGossipHarness();
  await emit("session_start");
  setSessionId("pi-second");
  await emit("session_start", { reason: "new" });
  expect(events.map((event) => [event.session_id, event.state])).toEqual([
    ["pi-first", "idle"], ["pi-first", "terminated"], ["pi-second", "idle"],
  ]);
  expect(events[1].event_type).toBe("session_end");
});

test("telemetry failures do not interrupt the agent or prevent later reporting", async () => {
  const { events, emit } = createPiGossipHarness();
  globalThis.fetch = mock(async () => { throw new Error("server offline"); });
  await emit("session_start");
  globalThis.fetch = mock(async (_url, options) => {
    events.push(JSON.parse(options.body));
    return new Response("{}");
  });
  await emit("agent_start");
  expect(events[0].state).toBe("running");
});

test("starts heartbeat only with a session and re-registers idle agents after recovery", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let heartbeat;
  const timer = { unref: mock(() => {}) };
  globalThis.setInterval = mock((callback, interval) => {
    expect(interval).toBe(15_000);
    heartbeat = callback;
    return timer;
  });
  globalThis.clearInterval = mock(() => {});
  try {
    const { events, emit } = createPiGossipHarness();
    expect(heartbeat).toBeUndefined();
    await emit("session_start");
    expect(timer.unref).toHaveBeenCalled();
    events.length = 0; // Models a gossip server that lost its registrations.
    heartbeat();
    await new Promise(setImmediate);
    expect(events[0]).toMatchObject({ event_type: "pi.heartbeat", state: "idle" });
    await emit("session_shutdown");
    expect(globalThis.clearInterval).toHaveBeenCalledWith(timer);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("shutdown removes the session and ignores later lifecycle events", async () => {
  const { events, emit } = createPiGossipHarness();
  await emit("session_start");
  await emit("session_shutdown");
  await emit("agent_start");
  expect(events.map((event) => event.state)).toEqual(["idle", "terminated"]);
});
