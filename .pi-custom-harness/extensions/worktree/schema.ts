import { Type } from "typebox";

/** TypeBox contract for worktree actions; `branch` is an optional contextual Git branch for `new`. */
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
  branch: Type.Optional(
    Type.String({
      minLength: 1,
      pattern:
        "^(feat|fix|chore|refactor|docs|test)/[^/\\\\]+/[A-Z][A-Z0-9_]*-[0-9]+$",
    }),
  ),
});

/** Static input retains action-specific narrowing; core validation enforces task where required. */
export type WorktreeInput =
  | { readonly action: "new"; readonly task: string; readonly branch?: string }
  | { readonly action: "verify"; readonly task: string }
  | { readonly action: "list" }
  | { readonly action: "rm"; readonly task: string };
