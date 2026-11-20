import type { MrIdentity } from "../../mr/module-port.js";
import type {
  ShipHost,
  ShipInput,
  ShipInvocation,
  ShipPipeline,
  ShipTarget,
} from "./ports.js";

interface ShipBlocker {
  category: string;
  message: string;
  resource: string | null;
}
interface ShipRecordedEffect {
  phase: string;
  target: string;
  outcome: "committed" | "unknown";
  reference?: string;
}
export class ShipFailureError extends Error {
  readonly code: string;
  readonly resource: string | null;
  readonly outcome: "blocked" | "partial" | "indeterminate" | "cancelled";
  readonly retainedEffects: readonly ShipRecordedEffect[];
  constructor(
    code: string,
    message: string,
    resource: string | null = null,
    outcome: "blocked" | "partial" | "indeterminate" | "cancelled" = "blocked",
    retainedEffects: readonly ShipRecordedEffect[] = []
  ) {
    super(message);
    this.name = "ShipFailureError";
    this.code = code;
    this.resource = resource;
    this.outcome = outcome;
    this.retainedEffects = retainedEffects;
  }
}
interface ShipEffect {
  phase: string;
  target: string;
  outcome: "committed" | "unknown";
  reference?: string;
}
export interface ShipRunState {
  head: string;
  pushed: string | null;
  mr: MrIdentity | null;
  pipeline: ShipPipeline | null;
  rounds: number;
  polls: number;
  commits: string[];
  effects: ShipEffect[];
  blockers: ShipBlocker[];
}
export interface ShipRun {
  state: ShipRunState;
  target: ShipTarget;
  host: ShipHost;
  input: ShipInput;
  invocation: ShipInvocation;
  maxPolls: number;
}
export function requireShipActive(invocation: ShipInvocation) {
  if (Date.now() >= invocation.deadline) {
    throw new ShipFailureError(
      "DEADLINE_EXCEEDED",
      "The shipping deadline expired."
    );
  }
  if (invocation.signal.aborted) {
    throw new ShipFailureError(
      "CANCELLED",
      "Shipping was cancelled.",
      null,
      "cancelled"
    );
  }
}
export function recordShipEffect(
  run: ShipRun,
  phase: string,
  reference: string
) {
  run.state.effects.push({
    outcome: "committed",
    phase,
    reference,
    target: run.target.repository,
  });
}
