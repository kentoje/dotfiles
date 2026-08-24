import { Effect } from "effect";

import {
  type TicketBinding,
  TicketService,
  type TicketStateError,
} from "../../lib/ticket/core";
import type { TicketInput } from "./schema";

/** Successful ticket tool result. */
export interface TicketResult {
  readonly action: "bind" | "current";
  readonly binding: TicketBinding;
}

/** Errors returned by ticket actions. */
export type TicketError = TicketStateError;

/** Executes bind/current against the injected ticket state service. */
export const runTicket = Effect.fn("runTicket")(function* ({
  input,
  cwd,
}: {
  readonly input: TicketInput;
  readonly cwd: string;
}) {
  const service = yield* TicketService;
  switch (input.action) {
    case "bind": {
      const binding = yield* service.bind({ cwd, ticketKey: input.key ?? "" });
      return { action: input.action, binding } satisfies TicketResult;
    }
    case "current": {
      const binding = yield* service.current({ cwd });
      return { action: input.action, binding } satisfies TicketResult;
    }
    default: {
      const _exhaustive: never = input.action;
      return _exhaustive;
    }
  }
});
