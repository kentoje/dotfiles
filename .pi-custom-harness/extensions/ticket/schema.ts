import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";

/** Parameters accepted by the ticket binding tool. */
export const TicketParams = Type.Object({
  action: StringEnum(["bind", "current"] as const),
  key: Type.Optional(
    Type.String({
      description:
        "Jira-style ticket key, required for bind (for example CI-6600)",
    }),
  ),
});

/** Input derived from the tool's single TypeBox schema. */
export type TicketInput = Static<typeof TicketParams>;
