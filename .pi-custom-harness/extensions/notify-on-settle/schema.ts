import { type Static, Type } from "typebox";

/** Outcomes that can be observed when an agent settles. */
export const NotifyOnSettleParams = Type.Object({
  sessionId: Type.String(),
  outcome: Type.Union([
    Type.Literal("clean"),
    Type.Literal("ship-gate-failed"),
    Type.Literal("pipeline-red"),
    Type.Literal("pipeline-pending"),
  ]),
  failureId: Type.Optional(Type.String()),
  message: Type.Optional(Type.String()),
});

/** Input accepted by the Pi shell and the Effect policy. */
export type NotifyOnSettleInput = Static<typeof NotifyOnSettleParams>;
