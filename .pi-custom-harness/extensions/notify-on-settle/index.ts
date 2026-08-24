import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import {
  createNotifyOnSettleState,
  decodeSettlementOutcome,
  NotifyOnSettleService,
  notifyOnSettle,
  SETTLEMENT_OUTCOME_CHANNEL,
} from "./core";
import type { NotifyOnSettleInput } from "./schema";

const pendingOutcomes = new Map<string, NotifyOnSettleInput>();
const state = createNotifyOnSettleState();

const staleContextErrorPrefix =
  "This extension ctx is stale after session replacement or reload.";

const isStaleContextError = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith(staleContextErrorPrefix);

const runWithStaleContextGuard = async (
  operation: () => void | Promise<void>,
): Promise<void> => {
  try {
    await operation();
  } catch (error) {
    if (isStaleContextError(error)) return;
    throw error;
  }
};

/** Records the latest outcome for the session before its settled event fires. */
export const recordNotifyOnSettleOutcome = (
  outcome: NotifyOnSettleInput,
): void => {
  pendingOutcomes.set(outcome.sessionId, outcome);
};

const runSettlementOutcome = async (
  input: NotifyOnSettleInput,
  send: (message: string) => void,
): Promise<void> => {
  await Effect.runPromise(
    notifyOnSettle({ input, state }).pipe(
      Effect.provideService(NotifyOnSettleService, {
        send: (notification) => Effect.sync(() => send(notification.message)),
      }),
    ),
  );
};

/** Registers failure-only notifications at the Pi event boundary. */
export default function registerNotifyOnSettle(pi: ExtensionAPI): void {
  const unsubscribe = pi.events.on(SETTLEMENT_OUTCOME_CHANNEL, (value) => {
    const outcome = decodeSettlementOutcome(value);
    if (outcome === undefined) return;
    recordNotifyOnSettleOutcome(outcome);
    void runWithStaleContextGuard(() =>
      runSettlementOutcome(outcome, (message) =>
        pi.sendMessage(
          {
            customType: "notify-on-settle",
            content: [{ type: "text", text: message }],
            display: false,
            details: outcome,
          },
          { deliverAs: "nextTurn", triggerTurn: false },
        ),
      ),
    );
  });
  pi.on("agent_settled", (_event, context) =>
    runWithStaleContextGuard(async () => {
      const sessionId = context.sessionManager.getSessionId();
      const outcome = pendingOutcomes.get(sessionId);
      if (outcome === undefined) return;
      pendingOutcomes.delete(sessionId);

      const ui = context.ui;
      await Effect.runPromise(
        notifyOnSettle({ input: outcome, state }).pipe(
          Effect.provideService(NotifyOnSettleService, {
            send: (notification) =>
              Effect.sync(() => ui.notify(notification.message, "error")),
          }),
        ),
      );
    }),
  );

  pi.on("session_shutdown", (_event, context) =>
    runWithStaleContextGuard(() => {
      unsubscribe();
      const sessionId = context.sessionManager.getSessionId();
      pendingOutcomes.delete(sessionId);
    }),
  );
}
