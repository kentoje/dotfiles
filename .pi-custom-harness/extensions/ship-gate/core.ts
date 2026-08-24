import type { Effect } from "effect";

import {
  evaluateShipGate,
  recordShipGateAttempt,
  runShipGate,
  type ShipGateAttemptRecord,
  type ShipGateBlocker,
  type ShipGateFacts,
  type ShipGateFactsError,
  ShipGateFactsService,
  type ShipGateOutcome,
  type ShipGateRuntimeState,
} from "../../lib/ship-gate/core";

export type {
  ShipGateAttemptRecord,
  ShipGateBlocker,
  ShipGateFacts,
  ShipGateFactsError,
  ShipGateOutcome,
  ShipGateRuntimeState,
};
export {
  evaluateShipGate,
  recordShipGateAttempt,
  runShipGate,
  ShipGateFactsService,
};

/** Pi-free input for one ship-gate evaluation. */
export interface ShipGateEvaluationInput {
  readonly attempt: number;
  readonly facts: ShipGateFacts;
}

/** Evaluates the complete policy without session or message-delivery concerns. */
export const evaluate = ({
  attempt,
  facts,
}: ShipGateEvaluationInput): ShipGateOutcome =>
  evaluateShipGate({ attempt, facts });

/** Runs one fact lookup and policy evaluation through a fakeable Effect service. */
export const evaluateWithFacts = (input: {
  readonly cwd: string;
  readonly attempt: number;
  readonly state: ShipGateRuntimeState;
}): Effect.Effect<ShipGateOutcome, ShipGateFactsError, ShipGateFactsService> =>
  runShipGate(input);
