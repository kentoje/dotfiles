import { isAbsolute } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

import { checkCommitAndPush, findOrCreateShipMr } from "./delivery/deliver.js";
import type {
  ShipHost,
  ShipInvocation,
  ShipTarget,
} from "./invocation/ports.js";
import { requireShipActive, ShipFailureError } from "./invocation/state.js";
import type { ShipRunState } from "./invocation/state.js";
import { driveShipReadiness } from "./readiness/check.js";

const text = Type.String({ maxLength: 4096, minLength: 1, pattern: "\\S" });
const shipInput = Type.Object(
  {
    commit_message: Type.Optional(text),
    cwd: Type.Optional(text),
    deadline_minutes: Type.Optional(Type.Integer({ maximum: 120, minimum: 1 })),
    description: Type.Optional(Type.String({ maxLength: 65_000 })),
    max_fix_rounds: Type.Optional(Type.Integer({ maximum: 10, minimum: 0 })),
    repository: Type.Optional(text),
    target_branch: Type.Optional(text),
    task_paths: Type.Optional(Type.Array(text, { maxItems: 100 })),
    title: Type.Optional(
      Type.String({ maxLength: 240, minLength: 1, pattern: "\\S" })
    ),
  },
  { additionalProperties: false }
);
function validShipPaths(paths: readonly string[]) {
  return (
    new Set(paths).size === paths.length &&
    paths.every(
      (path) =>
        !isAbsolute(path) &&
        !path.startsWith("-") &&
        !/[\0\r\n]/u.test(path) &&
        path
          .split("/")
          .every((part) => part && ![".", "..", ".git"].includes(part))
    )
  );
}
function shipReport(
  target: ShipTarget | undefined,
  state: ShipRunState,
  failure?: ShipFailureError
) {
  if (failure) {
    state.blockers.push({
      category: failure.code,
      message: failure.message,
      resource: failure.resource,
    });
  }
  const status =
    failure?.outcome === "blocked" && state.effects.length
      ? "partial"
      : (failure?.outcome ?? "ok");
  return {
    completed_effects: state.effects,
    context: target
      ? {
          branch: target.branch,
          head_sha: state.head,
          repository: target.repository,
          target_branch: target.targetBranch,
        }
      : {},
    data: target
      ? {
          blockers: state.blockers,
          branch: target.branch,
          commits_created: state.commits,
          fix_rounds: state.rounds,
          head_sha: state.head,
          merge_request: state.mr,
          next_steps: state.blockers.map(({ message }) => message),
          pipeline: state.pipeline,
          pushed_sha: state.pushed,
          repository: target.repository,
          state: status === "ok" ? "ready_for_review" : status,
        }
      : null,
    error: failure
      ? {
          code: failure.code,
          message: failure.message,
          phase: state.effects.at(-1)?.phase ?? "preflight",
          retryable: false,
        }
      : null,
    status,
    warnings: [],
  };
}

/** The composition root grants authorization with a trusted callback. Public arguments cannot supply it. */
function shipFailureReport(
  error: unknown,
  target: ShipTarget | undefined,
  state: ShipRunState,
  invocation: ShipInvocation
) {
  if (error instanceof ShipFailureError) {
    state.effects.push(...error.retainedEffects);
    if (
      error.outcome === "indeterminate" &&
      !error.retainedEffects.some((effect) => effect.outcome === "unknown")
    ) {
      state.effects.push({
        outcome: "unknown",
        phase: error.code,
        target: target?.repository ?? "shipping",
        ...(error.resource ? { reference: error.resource } : {}),
      });
    }
    return shipReport(target, state, error);
  }
  if (Date.now() >= invocation.deadline) {
    return shipReport(
      target,
      state,
      new ShipFailureError(
        "DEADLINE_EXCEEDED",
        "The shipping deadline expired."
      )
    );
  }
  if (invocation.signal.aborted) {
    return shipReport(
      target,
      state,
      new ShipFailureError(
        "CANCELLED",
        "Shipping was cancelled.",
        null,
        "cancelled"
      )
    );
  }
  return shipReport(
    target,
    state,
    new ShipFailureError(
      "SHIP_FAILED",
      "Shipping stopped before the next verified phase."
    )
  );
}

export function createShipCommand(host: ShipHost) {
  return async (
    input: unknown,
    options: {
      signal?: AbortSignal;
      maxPolls?: number;
      timeoutMs?: number;
    } = {}
  ) => {
    const state: ShipRunState = {
      blockers: [],
      commits: [],
      effects: [],
      head: "",
      mr: null,
      pipeline: null,
      polls: 0,
      pushed: null,
      rounds: 0,
    };
    let target: ShipTarget | undefined;
    if (
      !Value.Check(shipInput, input) ||
      !validShipPaths(input.task_paths ?? []) ||
      /^\s*\/[a-z]/imu.test(input.description ?? "")
    ) {
      return shipReport(
        undefined,
        state,
        new ShipFailureError(
          "TASK_SCOPE_AMBIGUOUS",
          "Use exact repository-relative files and valid /ship arguments."
        )
      );
    }
    const duration = Math.min(
      (input.deadline_minutes ?? 30) * 60_000,
      options.timeoutMs ?? Infinity
    );
    const deadline = Date.now() + duration;
    const signal = AbortSignal.any([
      AbortSignal.timeout(duration),
      ...(options.signal ? [options.signal] : []),
    ]);
    const invocation = { deadline, signal };
    try {
      requireShipActive(invocation);
      target = await host.resolve(input, invocation);
      state.head = target.head;
      if (
        !target.branch ||
        target.branch === target.defaultBranch ||
        target.branch === target.targetBranch
      ) {
        throw new ShipFailureError(
          "DEFAULT_OR_DETACHED_BRANCH",
          "Select a task branch with a different target branch."
        );
      }
      if (!(await host.authorize(target, input, invocation))) {
        throw new ShipFailureError(
          "SHIP_AUTHORIZATION_REQUIRED",
          "Shipping requires an explicit user command."
        );
      }
      const run = {
        host,
        input,
        invocation,
        maxPolls: options.maxPolls ?? Math.ceil(duration / 15_000),
        state,
        target,
      };
      const scope = await checkCommitAndPush(run, false);
      state.mr = await findOrCreateShipMr(run, scope);
      state.mr = await driveShipReadiness(run, state.mr.iid);
      return shipReport(target, state);
    } catch (error) {
      return shipFailureReport(error, target, state, invocation);
    }
  };
}
export { ShipFailureError } from "./invocation/state.js";
export type {
  ShipHost,
  ShipInput,
  ShipInvocation,
  ShipScope,
  ShipTarget,
} from "./invocation/ports.js";
