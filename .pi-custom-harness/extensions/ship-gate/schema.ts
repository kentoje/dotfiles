import { type Static, Type } from "typebox";

/** Event state supplied by the Pi boundary to the ship-gate policy. */
export const ShipGateParams = Type.Object({
  cwd: Type.String(),
  figmaBacked: Type.Boolean(),
  visualReviewComplete: Type.Boolean(),
  editGeneration: Type.Integer({ minimum: 0 }),
  repositoryWideEditGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
  focusedTestEditGeneration: Type.Optional(Type.Integer({ minimum: 0 })),
});

/** Input accepted by the Pi event boundary and the Effect policy. */
export type ShipGateInput = Static<typeof ShipGateParams>;
