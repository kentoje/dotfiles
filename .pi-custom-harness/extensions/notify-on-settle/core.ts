import { Context, Effect } from "effect";
import { Value } from "typebox/value";
import type { NotifyOnSettleInput } from "./schema";
import { NotifyOnSettleParams } from "./schema";

/** Shared event-bus channel for typed settlement outcomes. */
export const SETTLEMENT_OUTCOME_CHANNEL =
  "pi-custom-harness/settlement-outcome";

/** Typed payload published by ship-gate producers. */
export type SettlementOutcome = NotifyOnSettleInput;

/** Decodes unknown event-bus data using the settlement TypeBox schema. */
export const decodeSettlementOutcome = (
  value: unknown,
): SettlementOutcome | undefined =>
  Value.Check(NotifyOnSettleParams, value) ? value : undefined;

/** Builds the stable ship-gate failure payload published after one attempt. */
export const makeShipGateSettlementOutcome = (input: {
  readonly sessionId: string;
  readonly attempt: number;
  readonly message: string;
}): SettlementOutcome => ({
  sessionId: input.sessionId,
  outcome: "ship-gate-failed",
  failureId: `ship-gate-attempt-${input.attempt}`,
  message: input.message,
});

/** The notification transport injected by the Pi boundary or a test. */
export class NotifyOnSettleService extends Context.Service<
  NotifyOnSettleService,
  {
    readonly send: (
      notification: NotifyOnSettleNotification,
    ) => Effect.Effect<void, never>;
  }
>()("pi-custom-harness/extensions/notify-on-settle/NotifyOnSettleService") {}

/** The failure payload sent to the injected notification transport. */
export interface NotifyOnSettleNotification {
  readonly sessionId: string;
  readonly outcome: "ship-gate-failed";
  readonly failureId: string;
  readonly message: string;
}

/** State shared by one handler registration for duplicate suppression. */
export interface NotifyOnSettleState {
  readonly sentKeys: Set<string>;
}

/** Creates empty duplicate-suppression state. */
export const createNotifyOnSettleState = (): NotifyOnSettleState => ({
  sentKeys: new Set<string>(),
});

/** The observable policy decision returned by the Pi-free core. */
export type NotifyOnSettleDecision =
  | { readonly kind: "silent"; readonly outcome: "clean" }
  | { readonly kind: "duplicate"; readonly key: string }
  | {
      readonly kind: "notified";
      readonly key: string;
      readonly notification: NotifyOnSettleNotification;
    };

const fallbackFailureId = "unknown-failure";

const defaultMessageFor = (): string => "Ship gate failed.";

const keyFor = (input: NotifyOnSettleInput, failureId: string): string =>
  [input.sessionId, input.outcome, failureId].join("\u0000");

/** Applies failure-only notification policy and suppresses duplicate failures. */
export const notifyOnSettle = Effect.fn("notifyOnSettle")(function* ({
  input,
  state,
}: {
  readonly input: NotifyOnSettleInput;
  readonly state: NotifyOnSettleState;
}) {
  if (input.outcome === "clean") {
    return { kind: "silent", outcome: input.outcome } as const;
  }

  const failureId = input.failureId ?? fallbackFailureId;
  const notification: NotifyOnSettleNotification = {
    sessionId: input.sessionId,
    outcome: input.outcome,
    failureId,
    message: input.message ?? defaultMessageFor(),
  };
  const key = keyFor(input, failureId);
  const shouldSend = yield* Effect.sync(() => {
    if (state.sentKeys.has(key)) return false;
    state.sentKeys.add(key);
    return true;
  });

  if (!shouldSend) {
    return { kind: "duplicate", key } as const;
  }

  const service = yield* NotifyOnSettleService;
  yield* service.send(notification);
  return { kind: "notified", key, notification } as const;
});
