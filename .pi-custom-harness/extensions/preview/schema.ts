import { Type } from "typebox";

/** TypeBox parameters use one object for Vertex function-declaration compatibility. */
export const PreviewParams = Type.Object({
  action: Type.Union([Type.Literal("url"), Type.Literal("up")]),
  mode: Type.Optional(
    Type.Union([
      Type.Literal("sandbox"),
      Type.Literal("integrate"),
      Type.Literal("mock"),
    ]),
  ),
});

/** Static input retains action-specific narrowing; the core ignores mode for url. */
export type PreviewInput =
  | { readonly action: "url" }
  | {
      readonly action: "up";
      readonly mode?: "sandbox" | "integrate" | "mock";
    };
