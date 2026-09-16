import { realpath } from "node:fs/promises";

import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { runTool } from "../../lib/pi-bridge/core";
import { TicketLiveLayer } from "../../lib/ticket/live";
import { runTicket, type TicketResult } from "./core";
import { type TicketInput, TicketParams } from "./schema";

interface TicketFailureDetails {
  readonly action: TicketInput["action"];
  readonly error: string;
}

type TicketToolDetails = TicketResult | TicketFailureDetails;

/** Registers ticket binding actions. */
export default function registerTicket(pi: ExtensionAPI): void {
  pi.registerTool<typeof TicketParams, TicketToolDetails>({
    name: "ticket",
    label: "Ticket",
    description:
      "Bind a Jira-style ticket to an explicit worktree, or resolve a selected/current worktree binding.",
    promptSnippet: "Bind or resolve a worktree ticket",
    promptGuidelines: [
      "Pass the absolute path returned by worktree new or verify when binding or querying a task worktree.",
      "Use ticket for local branch-to-ticket binding; do not query Jira through it.",
    ],
    parameters: TicketParams,
    async execute(
      _toolCallId,
      params: TicketInput,
      signal,
      _onUpdate,
      context,
    ) {
      const requestedPath = params.worktree ?? context.cwd;
      const effect = Effect.tryPromise({
        try: () => realpath(requestedPath),
        catch: () => requestedPath,
      }).pipe(
        Effect.flatMap((cwd) =>
          runTicket({
            input:
              params.action === "bind" ? { ...params, worktree: cwd } : params,
            cwd,
          }).pipe(Effect.provide(TicketLiveLayer)),
        ),
        Effect.map(
          (result): AgentToolResult<TicketToolDetails> => ({
            content: [{ type: "text", text: JSON.stringify(result.binding) }],
            details: result,
          }),
        ),
      );

      // The Pi runtime currently exports no queue handle on ExtensionContext. Keep
      // the mutation inside the live state operation so the queue can be applied
      // here when Pi exposes its official withFileMutationQueue boundary.
      return runTool(effect, {
        signal,
        failurePrefix: "Ticket",
        failureResult: (reason) => ({
          content: [{ type: "text", text: reason }],
          details: { action: params.action, error: reason },
        }),
      });
    },
  });
}
