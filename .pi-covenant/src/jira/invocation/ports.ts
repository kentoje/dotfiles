export type JiraRequest =
  | { route: "issue"; key: string; fields?: readonly string[] }
  | { route: "edit-fields" | "transitions"; key: string }
  | { route: "search"; query: URLSearchParams }
  | {
      route: "types" | "create-fields";
      project: string;
      type?: string;
      start: number;
    }
  | {
      route: "update" | "comment" | "transition";
      key: string;
      body: Record<string, unknown>;
    }
  | { route: "create"; body: Record<string, unknown> };

export type JiraResponse =
  | { kind: "ok"; data: unknown }
  | { kind: "rejected"; status: number }
  | { kind: "unavailable" | "unknown" | "stopped" }
  | { kind: "acknowledged" };

export interface JiraConfirmation {
  readonly action: string;
  readonly site: string;
  readonly key?: string;
  readonly project?: string;
  readonly payload: Record<string, unknown>;
  readonly duplicate?: {
    readonly identity: string;
    readonly matches: readonly {
      key: string;
      state: string;
      summary: string;
    }[];
  };
}

export interface JiraHost {
  readonly acquireWrite?: (site: string, target: string) => (() => void) | null;
  readonly site: string;
  readonly request: (
    request: JiraRequest,
    signal: AbortSignal
  ) => Promise<JiraResponse>;
  readonly confirm?: (
    confirmation: JiraConfirmation,
    signal: AbortSignal
  ) => Promise<boolean>;
}

export interface JiraInvocation {
  readonly signal?: AbortSignal;
  readonly deadline?: number;
}
