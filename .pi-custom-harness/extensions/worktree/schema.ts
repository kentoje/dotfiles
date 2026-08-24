import { Type } from "typebox";

/** TypeBox contract for the four worktree actions; action-specific task presence is checked by the core. */
export const WorktreeParams = Type.Object({
  action: Type.Union([
    Type.Literal("new"),
    Type.Literal("verify"),
    Type.Literal("list"),
    Type.Literal("rm"),
  ]),
  task: Type.Optional(
    Type.String({
      minLength: 1,
      pattern: "^[^/\\\\]+$",
    }),
  ),
});

/** Static input retains action-specific narrowing; core validation enforces task for mutations. */
export type WorktreeInput =
  | { readonly action: "new"; readonly task: string }
  | { readonly action: "verify" }
  | { readonly action: "list" }
  | { readonly action: "rm"; readonly task: string };
