import type { MrIdentity } from "../../mr/module-port.js";

export interface ShipTarget {
  branch: string;
  cwd: string;
  defaultBranch: string;
  head: string;
  repository: string;
  targetBranch: string;
  remote: string;
  project: string;
  title: string;
  projectId?: number;
}
export interface ShipInput {
  cwd?: string;
  repository?: string;
  target_branch?: string;
  task_paths?: readonly string[];
  title?: string;
  description?: string;
  commit_message?: string;
  deadline_minutes?: number;
  max_fix_rounds?: number;
}
export interface ShipScope {
  fingerprint: string;
  paths: readonly string[];
  hasChanges: boolean;
}
export interface ShipInvocation {
  deadline: number;
  signal: AbortSignal;
}
export interface ShipPipeline {
  id: number;
  ref: string;
  sha: string;
  state: string;
  url?: string;
  source?: string;
}
export interface ShipThread {
  id: string;
  body: string;
  author: string;
}
export interface ShipObservation {
  mr: MrIdentity;
  pipeline: ShipPipeline | null;
  threads: readonly ShipThread[];
  complete: boolean;
  requiredJobsReady?: boolean;
}
export interface ShipReply {
  kind: "reply";
  threadId: string;
  body: string;
  disposition: "addressed" | "declined";
}
export type ShipDecision = ShipReply | { kind: "repair" | "stop" | "retry" };
export interface ShipHost {
  authorize: (
    target: ShipTarget,
    input: ShipInput,
    invocation: ShipInvocation
  ) => Promise<boolean>;
  resolve: (
    input: ShipInput,
    invocation: ShipInvocation
  ) => Promise<ShipTarget>;
  prepare: (
    target: ShipTarget,
    paths: readonly string[],
    invocation: ShipInvocation
  ) => Promise<ShipScope>;
  check: (target: ShipTarget, invocation: ShipInvocation) => Promise<boolean>;
  preflight: (
    target: ShipTarget,
    scope: ShipScope,
    input: ShipInput,
    pushed: boolean,
    invocation: ShipInvocation
  ) => Promise<MrIdentity | null>;
  commit: (
    target: ShipTarget,
    scope: ShipScope,
    message: string,
    invocation: ShipInvocation
  ) => Promise<string>;
  push: (
    target: ShipTarget,
    head: string,
    invocation: ShipInvocation
  ) => Promise<void>;
  create: (
    target: ShipTarget,
    head: string,
    input: ShipInput,
    invocation: ShipInvocation
  ) => Promise<MrIdentity>;
  observe: (
    target: ShipTarget,
    iid: number,
    head: string,
    invocation: ShipInvocation
  ) => Promise<ShipObservation>;
  decide: (
    observation: ShipObservation,
    reason: "review" | "ci" | "transient",
    invocation: ShipInvocation
  ) => Promise<ShipDecision>;
  reply: (
    target: ShipTarget,
    iid: number,
    decision: ShipReply,
    invocation: ShipInvocation
  ) => Promise<string>;
  transient?: (
    target: ShipTarget,
    pipeline: ShipPipeline,
    invocation: ShipInvocation
  ) => Promise<boolean>;
  retry?: (
    target: ShipTarget,
    pipeline: ShipPipeline,
    invocation: ShipInvocation
  ) => Promise<string>;
  markReady: (
    target: ShipTarget,
    iid: number,
    head: string,
    invocation: ShipInvocation
  ) => Promise<MrIdentity>;
  wait: (invocation: ShipInvocation) => Promise<void>;
}
