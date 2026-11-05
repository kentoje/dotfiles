import { resolve } from "node:path";

import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";

import type { ProjectCheckRunRequest } from "../configuration/plan.js";
import {
  projectCheckRunRequestSchema,
  ProjectCheckError,
} from "../configuration/plan.js";
import { inspectProjectChecks } from "../discovery/inspect.js";
import type { DiscoveredProjectCheck } from "../discovery/model.js";
import type {
  ProjectCheckInvocation,
  ProjectCheckResult,
} from "../execution/process.js";
import {
  executeProjectCheck,
  unexecutedProjectCheck,
} from "../execution/process.js";

/** Full mandatory check result; only pass has exit code zero. */
export interface ProjectCheckReport {
  project: string;
  keep_going: boolean;
  outcome: "pass" | "fail" | "blocked" | "cancelled";
  exit_code: 0 | 1 | 2 | 130;
  checks: ProjectCheckResult[];
  diagnostic: string | null;
  discovered: DiscoveredProjectCheck[];
  notes: string[];
}

function shouldStopProjectChecks(
  result: ProjectCheckResult,
  invocation: ProjectCheckInvocation,
  keepGoing: boolean
) {
  return (
    result.status === "cancelled" ||
    invocation.signal?.aborted === true ||
    (invocation.deadline !== undefined && invocation.deadline <= Date.now()) ||
    (!keepGoing && result.status !== "passed")
  );
}
/** Run the complete validated plan sequentially; never retry or silently omit a check. */
export const runProjectChecks = Effect.fn("runProjectChecks")(
  function* runProjectChecks(
    request: ProjectCheckRunRequest,
    invocation: ProjectCheckInvocation = {}
  ) {
    const keepGoing = request.keep_going === true;
    const validated = yield* Schema.decodeUnknownEffect(
      projectCheckRunRequestSchema,
      { onExcessProperty: "error" }
    )(request).pipe(
      Effect.mapError(
        () =>
          new ProjectCheckError({
            message: "PROJECT_CHECK_INPUT: invalid check request",
          })
      ),
      Effect.catch((error) => Effect.succeed(error))
    );
    if (validated instanceof ProjectCheckError) {
      return {
        checks: [],
        diagnostic: validated.message,
        discovered: [],
        exit_code: 2,
        keep_going: false,
        notes: [],
        outcome: "blocked",
        project: resolve(request.project),
      } satisfies ProjectCheckReport;
    }
    if (
      invocation.deadline !== undefined &&
      !Number.isFinite(invocation.deadline)
    ) {
      return {
        checks: [],
        diagnostic: "PROJECT_CHECK_DEADLINE: deadline must be finite",
        discovered: [],
        exit_code: 2,
        keep_going: keepGoing,
        notes: [],
        outcome: "blocked",
        project: resolve(request.project),
      } satisfies ProjectCheckReport;
    }
    const plan = yield* inspectProjectChecks({
      project: validated.project,
      ...(validated.config ? { config: validated.config } : {}),
    }).pipe(Effect.catch((error) => Effect.succeed(error)));
    if (plan instanceof ProjectCheckError) {
      return {
        checks: [],
        diagnostic: plan.message,
        discovered: [],
        exit_code: 2,
        keep_going: keepGoing,
        notes: [],
        outcome: "blocked",
        project: resolve(request.project),
      } satisfies ProjectCheckReport;
    }
    if (!plan.checks.length) {
      return {
        checks: [],
        diagnostic:
          "PROJECT_CHECK_SELECTION: no local suite selected; configure required commands explicitly",
        discovered: plan.discovered,
        exit_code: 2,
        keep_going: keepGoing,
        notes: plan.notes,
        outcome: "blocked",
        project: plan.project,
      } satisfies ProjectCheckReport;
    }
    const checks: ProjectCheckResult[] = [];
    let stopped = false;
    for (const spec of plan.checks) {
      const result: ProjectCheckResult = stopped
        ? unexecutedProjectCheck(spec)
        : yield* executeProjectCheck(spec, invocation);
      checks.push(result);
      stopped ||= shouldStopProjectChecks(result, invocation, keepGoing);
    }
    const passed =
      checks.length === plan.checks.length &&
      checks.length > 0 &&
      checks.every((check) => check.status === "passed" && check.code === 0) &&
      !invocation.signal?.aborted;
    const cancelled =
      invocation.signal?.aborted ||
      checks.some((check) => check.status === "cancelled");
    let summary: Pick<
      ProjectCheckReport,
      "outcome" | "exit_code" | "diagnostic"
    > = {
      diagnostic:
        "PROJECT_CHECK_FAILED: required checks failed or did not complete",
      exit_code: 1,
      outcome: "fail",
    };
    if (passed) {
      summary = { diagnostic: null, exit_code: 0, outcome: "pass" };
    } else if (cancelled) {
      summary = {
        diagnostic:
          "PROJECT_CHECK_CANCELLED: execution stopped; checks were not rolled back",
        exit_code: 130,
        outcome: "cancelled",
      };
    }
    return {
      checks,
      discovered: plan.discovered,
      keep_going: keepGoing,
      notes: plan.notes,
      project: plan.project,
      ...summary,
    } satisfies ProjectCheckReport;
  },
  Effect.provide(NodeServices.layer)
);
