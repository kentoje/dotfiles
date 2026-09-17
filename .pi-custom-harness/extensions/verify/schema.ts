import { type Static, Type } from "typebox";

/** Focused checks available to the agent; repository-wide checks are a user command. */
export const VerifyParams = Type.Object({
  action: Type.Union([
    Type.Literal("types"),
    Type.Literal("lint"),
    Type.Literal("test"),
  ]),
  file: Type.Optional(Type.String()),
});

/** Input accepted by the Pi shell and Effect core. */
export type VerifyInput = Static<typeof VerifyParams>;
