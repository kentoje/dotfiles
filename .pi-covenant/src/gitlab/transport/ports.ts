import type { Effect } from "effect";

import type {
  GitlabTarget,
  GitlabSelection,
} from "../../repository-context/module-port.js";
import type { GitlabCiRequest, GitlabMutationTarget } from "./ci-request.js";
/** One original host deadline covers credential lookup, attempts and decoding. */
export interface GitlabReadInvocation {
  readonly signal?: AbortSignal;
  readonly deadline?: number;
}
/** Transport errors contain stable safe diagnostics, never raw response or authentication bytes. */
export type GitlabWireResult =
  | {
      kind: "ok";
      body: unknown;
      pagination?: {
        next: string | null;
        page: string | null;
        perPage: string | null;
        linkNext: number | null;
      };
    }
  | {
      kind: "error";
      code: string;
      message: string;
      delivery?: "not_sent" | "unknown" | "rejected";
    };
/** The host provides fixed GitLab requests. Pipeline mutations require a separate authorization decision and permit. */
export interface GitlabReaderHost {
  readonly requestCi?: (
    target: GitlabTarget,
    request: GitlabCiRequest,
    invocation: GitlabReadInvocation
  ) => Effect.Effect<GitlabWireResult>;
  readonly authorizeMutation?: (
    target: GitlabMutationTarget,
    invocation: GitlabReadInvocation
  ) => Effect.Effect<boolean>;
  readonly acquireMutation?: (
    target: GitlabMutationTarget
  ) => (() => void) | null;
  readonly sessionCwd: string;
  readonly selection: GitlabSelection;
  readonly readProject: (
    target: GitlabTarget,
    invocation: GitlabReadInvocation
  ) => Effect.Effect<GitlabWireResult>;
}
