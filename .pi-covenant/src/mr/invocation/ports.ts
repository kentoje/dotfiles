import type { Effect } from "effect";

import type {
  GitlabReadInvocation,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import type { GitlabTarget } from "../../repository-context/module-port.js";

export interface MrSelector {
  cwd?: string;
  repository?: string;
  iid?: number;
}
export interface MrContext {
  host?: string;
  repository?: string;
  project_id?: number;
  iid?: number;
}
export interface MrIdentity {
  iid: number;
  source_branch: string;
  head_sha: string;
  target_branch?: string;
  title?: string;
  url?: string;
  draft?: boolean;
}
type Lookup<T> = Effect.Effect<{
  context: MrContext;
  data: T | null;
  error: { code: string } | null;
}>;
interface MrLookupMatch {
  iid: number;
  url: string;
  head_sha: string;
}
interface MrTarget {
  projectId: number;
  iid: number;
}

export type MrRequest =
  | { kind: "mrBranch"; projectId: number; branch: string }
  | {
      kind: "mrCreate";
      projectId: number;
      title: string;
      description?: string;
      sourceBranch: string;
      targetBranch: string;
    }
  | (MrTarget &
      (
        | { kind: "mr" }
        | { kind: "mrDiscussions"; page: number; pageSize: number }
        | { kind: "mrDiscussion"; threadId: string }
        | { kind: "mrResolve"; threadId: string }
        | { kind: "mrReply"; threadId: string; body: string }
        | { kind: "mrUpdate"; patch: { title?: string; description?: string } }
      ));

export interface MrAuthorization {
  host: string;
  repository: string;
  iid: number;
  action: "reply" | "update" | "create_draft" | "mark_ready";
  details: object;
}
export interface MrHost {
  gitlab: {
    repository: (
      request: Omit<MrSelector, "iid">,
      invocation: GitlabReadInvocation
    ) => Lookup<{
      identity: { branch: string | null };
      default_branch?: string | null;
    }>;
    lookup_open_mrs: (
      request: { repository: string; source_branch: string },
      invocation: GitlabReadInvocation
    ) => Lookup<{ complete: boolean; matches: readonly MrLookupMatch[] }>;
  };
  request: (
    target: GitlabTarget,
    request: MrRequest,
    invocation: GitlabReadInvocation
  ) => Effect.Effect<GitlabWireResult>;
  authorize?: (
    target: MrAuthorization,
    signal: AbortSignal
  ) => Promise<boolean>;
  acquireWrite?: (scope: string) => (() => void) | null;
  titlePrefix?: (repository: string) => Promise<string | undefined>;
}
