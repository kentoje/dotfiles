import { Type } from "typebox";
import { Value } from "typebox/value";

import {
  applyRetroProposals,
  retroProposalInput,
} from "./backlog/proposals.js";
import type { RetroItem } from "./backlog/proposals.js";
import { proposeObservedRetro } from "./review/observations.js";
import type { RetroObservation } from "./review/observations.js";

interface RetroHost {
  backlogPath: string;
  read: () => Promise<readonly RetroItem[]>;
  update: <T>(
    transform: (items: readonly RetroItem[]) => {
      items: readonly RetroItem[];
      data: T;
    }
  ) => Promise<T>;
  session: (id?: string) => Promise<readonly RetroObservation[] | null>;
  obligations: () => Promise<readonly string[]>;
}
const reviewInput = Type.Object(
  {
    dry_run: Type.Optional(Type.Boolean()),
    focus: Type.Optional(Type.String({ maxLength: 240 })),
    session_id: Type.Optional(
      Type.String({ pattern: "^[a-zA-Z0-9_-]{1,120}$" })
    ),
  },
  { additionalProperties: false }
);
const listInput = Type.Object(
  {
    state: Type.Optional(
      Type.Union([
        Type.Literal("proposed"),
        Type.Literal("accepted"),
        Type.Literal("discarded"),
        Type.Literal("all"),
      ])
    ),
  },
  { additionalProperties: false }
);

function retroResult<T>(data: T | null, error?: unknown) {
  const code = error instanceof Error ? error.message : "";
  const known = [
    "BACKLOG_INVALID",
    "BACKLOG_CONFLICT",
    "OUT_OF_SCOPE_PATH",
    "SESSION_UNAVAILABLE",
    "CONTRACT_UNAVAILABLE",
    "RECORD_INVALID",
    "INVALID_INPUT",
  ];
  const safeCode = known.includes(code) ? code : "RETRO_UNAVAILABLE";
  const blocked = [
    "OUT_OF_SCOPE_PATH",
    "SESSION_UNAVAILABLE",
    "RECORD_INVALID",
    "INVALID_INPUT",
  ].includes(safeCode);
  const failureStatus = blocked ? "blocked" : "error";
  return {
    completed_effects: [],
    context: {},
    data,
    error: error
      ? {
          code: safeCode,
          message: `Harness retrospective: ${safeCode}`,
          phase: "retro",
          retryable: safeCode === "BACKLOG_CONFLICT",
        }
      : null,
    status: error ? failureStatus : "ok",
    warnings: [],
  };
}

/** Explicit retrospective operations. The host owns session selection and atomic storage. */
export function makeRetrospectiveModule(host: RetroHost) {
  return {
    async list(input: unknown) {
      if (!Value.Check(listInput, input)) {
        return retroResult(null, new Error("INVALID_INPUT"));
      }
      try {
        const items = await host.read();
        return retroResult({
          backlog_path: host.backlogPath,
          items:
            input.state && input.state !== "all"
              ? items.filter((item) => item.state === input.state)
              : items,
        });
      } catch (error) {
        return retroResult(null, error);
      }
    },
    async record(input: unknown) {
      if (!Value.Check(retroProposalInput, input)) {
        return retroResult(null, new Error("RECORD_INVALID"));
      }
      try {
        const result = await host.update((items) =>
          applyRetroProposals(items, [input])
        );
        const [item] = result.proposals;
        if (!item) {
          return retroResult(null, new Error("BACKLOG_CONFLICT"));
        }
        return retroResult({ created: result.recorded_ids.length > 0, item });
      } catch (error) {
        return retroResult(null, error);
      }
    },
    async review(input: unknown) {
      if (!Value.Check(reviewInput, input)) {
        return retroResult(null, new Error("INVALID_INPUT"));
      }
      try {
        const [entries, obligations, items] = await Promise.all([
          host.session(input.session_id),
          host.obligations(),
          host.read(),
        ]);
        if (!entries) {
          return retroResult(null, new Error("SESSION_UNAVAILABLE"));
        }
        const proposals = proposeObservedRetro(
          entries,
          obligations,
          input.focus
        );
        const result =
          input.dry_run || !proposals.length
            ? {
                ...applyRetroProposals(items, proposals).data,
                recorded_ids: [],
              }
            : await host.update((latest) =>
                applyRetroProposals(latest, proposals)
              );
        return retroResult({ ...result, backlog_path: host.backlogPath });
      } catch (error) {
        return retroResult(null, error);
      }
    },
  };
}
export { normalizeRetroTitle, retroStoredItem } from "./backlog/proposals.js";
export type { RetroItem } from "./backlog/proposals.js";
export type { RetroObservation } from "./review/observations.js";
