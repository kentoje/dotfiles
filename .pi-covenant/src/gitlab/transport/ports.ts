import type { Effect } from "effect";

import type {
  GitlabTarget,
  GitlabSelection,
} from "../../repository-context/module-port.js";
/** One original host deadline covers credential lookup, attempts and decoding. */
export interface GitlabReadInvocation {
  readonly signal?: AbortSignal;
  readonly deadline?: number;
}
/** Transport errors contain stable safe diagnostics, never raw response or authentication bytes. */
export type GitlabWireResult =
  | { kind: "ok"; body: unknown }
  | { kind: "error"; code: string; message: string };
/** The read-only host port cannot express a mutation, arbitrary method or arbitrary endpoint. */
export interface GitlabReaderHost {
  readonly sessionCwd: string;
  readonly selection: GitlabSelection;
  readonly readProject: (
    target: GitlabTarget,
    invocation: GitlabReadInvocation
  ) => Effect.Effect<GitlabWireResult>;
}
