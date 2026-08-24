import { type Static, Type } from "typebox";

/** TypeBox discriminated parameters for status, threads, reply, update, and watch; there is no open action. */
export const MergeRequestParams = Type.Object({
  action: Type.Union([
    Type.Literal("status"),
    Type.Literal("threads"),
    Type.Literal("reply"),
    Type.Literal("update"),
    Type.Literal("watch"),
  ]),
  threadId: Type.Optional(Type.String({ minLength: 1 })),
  body: Type.Optional(Type.String({ minLength: 1 })),
  resolve: Type.Optional(Type.Boolean()),
  intervalMs: Type.Optional(Type.Integer({ minimum: 1 })),
});

/** Static input derived from the single TypeBox merge request action schema. */
export type MergeRequestInput = Static<typeof MergeRequestParams>;
