import { type Static, Type } from "typebox";

const StoryViewport = Type.Union([
  Type.String({ minLength: 1 }),
  Type.Object({
    width: Type.Integer({ minimum: 1 }),
    height: Type.Integer({ minimum: 1 }),
  }),
]);

/** TypeBox parameters use one object for Vertex function-declaration compatibility. */
export const StoryParams = Type.Object({
  action: Type.Union([Type.Literal("list"), Type.Literal("show")]),
  component: Type.String({ minLength: 1 }),
  story: Type.Optional(Type.String({ minLength: 1 })),
  viewport: Type.Optional(StoryViewport),
  theme: Type.Optional(Type.String({ minLength: 1 })),
});

/** Static input retains action-specific narrowing; the core validates action-required fields. */
export type StoryInput =
  | { readonly action: "list"; readonly component: string }
  | {
      readonly action: "show";
      readonly component: string;
      readonly story?: string;
      readonly viewport?: Static<typeof StoryViewport>;
      readonly theme?: string;
    };
