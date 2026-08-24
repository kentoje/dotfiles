import { type Static, Type } from "typebox";

/** The checks a caller can request directly, or the repository-defined complete list. */
export const VerifyParams = Type.Object({
  action: Type.Union([
    Type.Literal("types"),
    Type.Literal("lint"),
    Type.Literal("test"),
    Type.Literal("all"),
  ]),
  file: Type.Optional(Type.String()),
});

/** Input accepted by the Pi shell and Effect core. */
export type VerifyInput = Static<typeof VerifyParams>;
