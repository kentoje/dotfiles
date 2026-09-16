import { type Static, Type } from "typebox";

/** TypeBox parameters for one-shot MR status, thread, reply, and update actions. */
export const MergeRequestParams = Type.Object({
  action: Type.Union([
    Type.Literal("status"),
    Type.Literal("threads"),
    Type.Literal("reply"),
    Type.Literal("update"),
  ]),
  threadId: Type.Optional(Type.String({ minLength: 1 })),
  body: Type.Optional(Type.String({ minLength: 1 })),
  resolve: Type.Optional(Type.Boolean()),
});

/** Static input derived from the single TypeBox merge request action schema. */
export type MergeRequestInput = Static<typeof MergeRequestParams>;
