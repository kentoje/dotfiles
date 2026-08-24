import { type Static, Type } from "typebox";

/** TypeBox contract for read-only status/version sweeps and guarded fleet mutations. */
export const FleetParams = Type.Object({
  action: Type.Union([
    Type.Literal("status"),
    Type.Literal("versions"),
    Type.Literal("sync"),
    Type.Literal("install"),
    Type.Literal("prune"),
  ]),
  packageName: Type.Optional(Type.String({ minLength: 1 })),
  hard: Type.Optional(Type.Boolean()),
});

/** Input derived from the TypeBox fleet action contract. */
export type FleetInput = Static<typeof FleetParams>;
