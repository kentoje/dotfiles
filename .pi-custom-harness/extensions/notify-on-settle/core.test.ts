import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  createNotifyOnSettleState,
  type NotifyOnSettleNotification,
  NotifyOnSettleService,
  notifyOnSettle,
} from "./core";
import type { NotifyOnSettleInput } from "./schema";

const runNotify = (
  input: NotifyOnSettleInput,
  state = createNotifyOnSettleState(),
) => {
  const sent: NotifyOnSettleNotification[] = [];
  const effect = notifyOnSettle({ input, state }).pipe(
    Effect.provideService(NotifyOnSettleService, {
      send: (notification) => Effect.sync(() => void sent.push(notification)),
    }),
  );
  return Effect.runPromise(effect).then((decision) => ({ decision, sent }));
};

test("notifies on a terminal ship-gate failure", async () => {
  const result = await runNotify({
    sessionId: "session-1",
    outcome: "ship-gate-failed",
    failureId: "gate-attempt-3",
    message: "The merge request still has unresolved threads.",
  });

  expect(result.sent).toEqual([
    {
      sessionId: "session-1",
      outcome: "ship-gate-failed",
      failureId: "gate-attempt-3",
      message: "The merge request still has unresolved threads.",
    },
  ]);
  expect(result.decision.kind).toBe("notified");
});

test("notifies on a red pipeline", async () => {
  const result = await runNotify({
    sessionId: "session-1",
    outcome: "pipeline-red",
    failureId: "pipeline-17",
  });

  expect(result.sent).toEqual([
    {
      sessionId: "session-1",
      outcome: "pipeline-red",
      failureId: "pipeline-17",
      message: "Pipeline is red.",
    },
  ]);
});

test("stays silent on clean completion", async () => {
  const result = await runNotify({
    sessionId: "session-1",
    outcome: "clean",
  });

  expect(result.decision).toEqual({ kind: "silent", outcome: "clean" });
  expect(result.sent).toHaveLength(0);
});

test("stays silent while a pipeline is pending", async () => {
  const result = await runNotify({
    sessionId: "session-1",
    outcome: "pipeline-pending",
    failureId: "pipeline-17",
  });

  expect(result.decision).toEqual({
    kind: "silent",
    outcome: "pipeline-pending",
  });
  expect(result.sent).toHaveLength(0);
});

test("suppresses duplicate failures for the same session and identity", async () => {
  const state = createNotifyOnSettleState();
  const first = await runNotify(
    {
      sessionId: "session-1",
      outcome: "pipeline-red",
      failureId: "pipeline-17",
    },
    state,
  );
  const second = await runNotify(
    {
      sessionId: "session-1",
      outcome: "pipeline-red",
      failureId: "pipeline-17",
    },
    state,
  );

  expect(first.sent).toHaveLength(1);
  expect(second.sent).toHaveLength(0);
  expect(second.decision.kind).toBe("duplicate");
});
