import { type Static, Type } from "typebox";

/** TypeBox contract for listing or recording harness backlog checklist items. */
export const HarnessBacklogParams = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("record")]),
  title: Type.Optional(Type.String({ minLength: 1 })),
  kind: Type.Optional(
    Type.Union([Type.Literal("fix"), Type.Literal("feature")]),
  ),
  evidence: Type.Optional(Type.String({ minLength: 1 })),
  proposal: Type.Optional(Type.String({ minLength: 1 })),
  spec: Type.Optional(Type.String({ minLength: 1 })),
});

/** Input derived from the TypeBox harness backlog contract. */
export type HarnessBacklogInput = Static<typeof HarnessBacklogParams>;
