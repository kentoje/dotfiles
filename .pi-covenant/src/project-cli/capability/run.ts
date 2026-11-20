import { realpath, stat } from "node:fs/promises";

import { NodeServices } from "@effect/platform-node";
import { Effect, Schema } from "effect";

import {
  decodeProjectCheckPlan,
  projectCommandArgument,
  projectCommandSchema,
  readProjectCheckJson,
} from "../configuration/plan.js";
import type { ProjectCheckSpec } from "../configuration/plan.js";
import { executeProjectCheck } from "../execution/process.js";
import type { ProjectCheckInvocation } from "../execution/process.js";

const manifestPath = "project-capabilities.json";
const requestSchema = Schema.Struct({
  arguments: Schema.Array(projectCommandArgument).check(Schema.isMaxLength(32)),
  capability_id: projectCommandSchema.fields.id,
  project: Schema.NonEmptyString,
});
const manifestSchema = Schema.Struct({
  capabilities: Schema.NonEmptyArray(
    Schema.Struct({
      ...projectCommandSchema.fields,
      accepts_arguments: Schema.optionalKey(Schema.Boolean),
    })
  ).check(Schema.isMaxLength(64)),
});
function blockedCapability(
  capability_id: string,
  diagnostic: string,
  outcome: "blocked" | "cancelled" = "blocked"
) {
  return {
    capability_id,
    diagnostic,
    evidence: [],
    exit_code: null,
    outcome,
    owned_resources: [],
    result: null,
  };
}

/** Run only a named capability in the selected repository's explicit manifest. */
export const runProjectCapability = Effect.fn("runProjectCapability")(
  function* runProjectCapability(
    input: typeof requestSchema.Type,
    invocation: ProjectCheckInvocation & {
      authorize?: (target: {
        project: string;
        spec: ProjectCheckSpec;
      }) => Promise<boolean>;
    } = {}
  ) {
    const target = yield* Effect.tryPromise({
      catch: (error) => ({
        diagnostic: error instanceof Error ? error.message : String(error),
      }),
      try: async () => {
        const request = Schema.decodeUnknownSync(requestSchema, {
          onExcessProperty: "error",
        })(input);
        if (
          request.arguments.some(
            (argument) => Buffer.byteLength(argument) > 4096
          )
        ) {
          throw new Error(
            "PROJECT_CAPABILITY_ARGS: an argument exceeds 4096 bytes."
          );
        }
        const project = await realpath(request.project);
        const root = await stat(project);
        if (!root.isDirectory()) {
          throw new Error(
            "PROJECT_CAPABILITY_ROOT: selected project must be a directory."
          );
        }
        const manifest = Schema.decodeUnknownSync(manifestSchema, {
          onExcessProperty: "error",
        })(await readProjectCheckJson(project, manifestPath));
        const commands = manifest.capabilities.map(
          ({ accepts_arguments: _accepts, ...spec }) => spec
        );
        const plan = await decodeProjectCheckPlan(project, manifestPath, {
          checks: commands,
        });
        const selected = plan.checks.find(
          (check) => check.id === request.capability_id
        );
        const declaration = manifest.capabilities.find(
          (check) => check.id === request.capability_id
        );
        if (!selected || !declaration) {
          throw new Error(
            "PROJECT_CAPABILITY_UNAVAILABLE: no declared capability matches the requested ID."
          );
        }
        if (request.arguments.length && !declaration.accepts_arguments) {
          throw new Error(
            "PROJECT_CAPABILITY_ARGS: this capability does not accept additional arguments."
          );
        }
        return {
          project,
          spec: { ...selected, args: [...selected.args, ...request.arguments] },
        };
      },
    }).pipe(Effect.catch((error) => Effect.succeed(error)));
    if ("diagnostic" in target) {
      return blockedCapability(input.capability_id, target.diagnostic);
    }
    if (invocation.signal?.aborted) {
      return blockedCapability(
        input.capability_id,
        "PROJECT_CAPABILITY_CANCELLED: invocation cancelled.",
        "cancelled"
      );
    }
    if (
      invocation.deadline !== undefined &&
      (!Number.isFinite(invocation.deadline) ||
        invocation.deadline <= Date.now())
    ) {
      return blockedCapability(
        input.capability_id,
        "PROJECT_CAPABILITY_DEADLINE: invocation deadline is invalid or expired."
      );
    }
    if (invocation.authorize) {
      const allowed = yield* Effect.tryPromise({
        catch: () => false,
        try: () => invocation.authorize?.(target) ?? Promise.resolve(false),
      }).pipe(Effect.orElseSucceed(() => false));
      if (!allowed) {
        return blockedCapability(
          input.capability_id,
          "PROJECT_CAPABILITY_AUTH: exact capability approval is required."
        );
      }
    }
    const result = yield* executeProjectCheck(target.spec, invocation);
    let outcome: "pass" | "cancelled" | "fail" = "fail";
    if (result.status === "passed") {
      outcome = "pass";
    } else if (result.status === "cancelled") {
      outcome = "cancelled";
    }
    return {
      capability_id: result.id,
      diagnostic: null,
      evidence: [manifestPath],
      exit_code: result.code,
      outcome,
      owned_resources: [],
      result,
    };
  },
  Effect.provide(NodeServices.layer)
);
