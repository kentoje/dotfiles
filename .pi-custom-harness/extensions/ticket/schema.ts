import { type Static, Type } from "typebox";

/** Parameters accepted by the ticket binding tool. */
export const TicketParams = Type.Union([
  Type.Object({
    action: Type.Literal("bind"),
    key: Type.String({
      minLength: 1,
      description: "Jira-style ticket key (for example CI-6600)",
    }),
    worktree: Type.String({
      minLength: 1,
      pattern: "^/",
      description: "Absolute path returned by worktree new or worktree verify",
    }),
  }),
  Type.Object({
    action: Type.Literal("current"),
    worktree: Type.Optional(
      Type.String({
        minLength: 1,
        pattern: "^/",
        description:
          "Optional absolute worktree path; omitted only when the session is already rooted in the intended checkout",
      }),
    ),
  }),
]);

/** Input derived from the tool's single TypeBox schema. */
export type TicketInput = Static<typeof TicketParams>;
