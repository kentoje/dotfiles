import { Effect } from "effect";
import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

import type {
  JiraConfirmation,
  JiraHost,
  JiraInvocation,
  JiraRequest,
  JiraResponse,
} from "./ports.js";

type Status =
  | "ok"
  | "error"
  | "blocked"
  | "cancelled"
  | "partial"
  | "indeterminate";
interface CompletedEffect {
  phase: string;
  target: string;
  outcome: "committed" | "unknown";
  reference?: string;
}
export class JiraFailureError extends Error {
  readonly code: string;
  readonly status: Exclude<Status, "ok">;
  readonly details: Record<string, unknown> | undefined;
  constructor(
    code: string,
    message: string,
    status: Exclude<Status, "ok"> = "error",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "JiraFailureError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
function requireJiraActive(signal: AbortSignal) {
  if (signal.aborted) {
    throw new JiraFailureError(
      "JIRA_STOPPED",
      "Jira invocation stopped or exceeded its deadline.",
      "cancelled"
    );
  }
}
export interface JiraOperation {
  site: string;
  signal: AbortSignal;
  context: Record<string, unknown>;
  effects: CompletedEffect[];
  read: (request: JiraRequest) => Promise<unknown>;
  send: (request: JiraRequest) => Promise<JiraResponse>;
  confirm: (
    target: Omit<JiraConfirmation, "site">,
    duplicateError?: string
  ) => Promise<void>;
}
function readFailure(response: Exclude<JiraResponse, { kind: "ok" }>) {
  if (response.kind === "rejected") {
    if (response.status === 401) {
      return new JiraFailureError(
        "AUTH_REQUIRED",
        "Jira authentication was rejected."
      );
    }
    if (response.status === 403 || response.status === 404) {
      return new JiraFailureError(
        "FORBIDDEN_OR_NOT_FOUND",
        "Jira denied access or the resource could not be found."
      );
    }
  }
  return new JiraFailureError(
    "LOOKUP_FAILED",
    "Jira did not return usable read evidence."
  );
}
export function runJiraOperation<S extends TSchema, D>(options: {
  action: string;
  host: JiraHost;
  input: unknown;
  invocation: JiraInvocation;
  schema: S;
  run: (input: Static<S>, op: JiraOperation) => Promise<D>;
}) {
  return Effect.promise(async (effectSignal) => {
    const { action, host, input, invocation, schema, run } = options;
    const mutating = action !== "get" && action !== "search";
    const budget = mutating ? 60_000 : 30_000;
    const deadline = Math.min(
      invocation.deadline ?? Infinity,
      Date.now() + budget
    );
    const timeout = AbortSignal.timeout(
      Math.max(0, Math.ceil(deadline - Date.now()))
    );
    const signal = AbortSignal.any([
      timeout,
      effectSignal,
      ...(invocation.signal ? [invocation.signal] : []),
    ]);
    const context: Record<string, unknown> = { action, site: host.site };
    const completed_effects: CompletedEffect[] = [];
    const finish = (
      status: Status,
      data: D | null,
      error: JiraFailureError | null
    ) => ({
      completed_effects,
      context,
      data,
      error: error && {
        code: error.code,
        message: error.message,
        phase: status === "partial" ? "readback" : action,
        retryable: false,
        ...(error.details ? { details: error.details } : {}),
      },
      status,
      warnings: [],
    });
    const send = (req: JiraRequest) => {
      if (Date.now() >= deadline) {
        throw new JiraFailureError(
          "JIRA_STOPPED",
          "Jira invocation deadline expired.",
          "cancelled"
        );
      }
      requireJiraActive(signal);
      return host.request(req, signal);
    };
    const op: JiraOperation = {
      async confirm(target, duplicateError) {
        requireJiraActive(signal);
        const allowed = await host
          .confirm?.({ ...target, site: host.site }, signal)
          .catch(() => false);
        requireJiraActive(signal);
        if (!allowed) {
          throw new JiraFailureError(
            duplicateError ?? "AUTHORIZATION_REQUIRED",
            duplicateError
              ? "Creation requires a decision for the displayed exact duplicates."
              : "Jira write needs trusted host confirmation.",
            "blocked",
            target.duplicate
          );
        }
      },
      context,
      effects: completed_effects,
      async read(req) {
        const response = await send(req);
        requireJiraActive(signal);
        if (response.kind === "ok") {
          return response.data;
        }
        if (
          req.route === "search" &&
          response.kind === "rejected" &&
          response.status === 400
        ) {
          throw new JiraFailureError(
            "INVALID_QUERY",
            "Jira rejected the search query or continuation."
          );
        }
        throw readFailure(response);
      },
      send,
      signal,
      site: host.site,
    };
    let release: (() => void) | null | undefined;
    try {
      if (!Value.Check(schema, input)) {
        throw new JiraFailureError(
          "JIRA_INPUT",
          "Invalid Jira action arguments."
        );
      }
      const { site } = input;
      if (site !== undefined && site !== host.site) {
        throw new JiraFailureError(
          "JIRA_SITE",
          "The selected site is outside the host configuration.",
          "blocked"
        );
      }
      const target = action === "create" ? input.project : input.key;
      if (mutating && typeof target === "string") {
        release = host.acquireWrite?.(host.site, target);
        if (release === null) {
          throw new JiraFailureError(
            "WRITE_BUSY",
            "Another Jira write is in progress for this target.",
            "blocked"
          );
        }
      }
      return finish("ok", await run(input, op), null);
    } catch (error) {
      const failure =
        error instanceof JiraFailureError
          ? error
          : new JiraFailureError(
              "LOOKUP_FAILED",
              "Jira operation could not complete."
            );
      return finish(failure.status, null, failure);
    } finally {
      release?.();
    }
  });
}
