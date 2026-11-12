import { Schema } from "effect";
import { Type } from "typebox";

const optionalString = () => Type.Optional(Type.String({ minLength: 1 }));
/** Pi accepts one discriminated action at a time; unknown or unrelated fields are rejected. */
export const projectToolParameters = Type.Object(
  {
    action: Type.Union([Type.Literal("inspect"), Type.Literal("check")]),
    config: optionalString(),
    keep_going: Type.Optional(Type.Boolean()),
    project: optionalString(),
  },
  { additionalProperties: false }
);
const contextFields = {
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.NonEmptyString),
};
const projectFields = {
  config: Schema.optionalKey(Schema.NonEmptyString),
  project: Schema.optionalKey(Schema.NonEmptyString),
};
/** Effect validates tool invocation input again even if a caller bypasses Pi's argument validator. */
export const projectToolRequest = Schema.Union([
  Schema.Struct({ action: Schema.Literal("inspect"), ...projectFields }),
  Schema.Struct({
    action: Schema.Literal("check"),
    ...projectFields,
    keep_going: Schema.optionalKey(Schema.Boolean),
  }),
]);
/** Worktree actions expose existing module arguments, never setup commands or approval flags. */
export const worktreeToolParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal("new"),
      Type.Literal("verify"),
      Type.Literal("list"),
      Type.Literal("rm"),
    ]),
    base: optionalString(),
    branch: optionalString(),
    cwd: optionalString(),
    path: optionalString(),
    repository: optionalString(),
    task: optionalString(),
  },
  { additionalProperties: false }
);
/** Full action validation precedes repository/config lookup and module effects. */
export const worktreeToolRequest = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("new"),
    ...contextFields,
    base: Schema.optionalKey(Schema.NonEmptyString),
    branch: Schema.optionalKey(Schema.NonEmptyString),
    task: Schema.String.check(
      Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u)
    ),
  }),
  Schema.Struct({
    action: Schema.Literals(["verify", "rm"]),
    ...contextFields,
    path: Schema.NonEmptyString,
  }),
  Schema.Struct({ action: Schema.Literal("list"), ...contextFields }),
]);
