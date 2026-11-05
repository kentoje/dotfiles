import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/cli";

import type { DiscoveredProjectCheck } from "./discovery/model.js";
import { inspectProjectChecks, runProjectChecks } from "./module-port.js";

const flags = {
  config: Flag.String("config").pipe(
    Flag.optional,
    Flag.withDescription("Project-relative required-check JSON file")
  ),
  json: Flag.Boolean("json").pipe(Flag.withDefault(false)),
  project: Flag.String("project").pipe(
    Flag.withDefault("."),
    Flag.withDescription("Repository or non-Git project directory")
  ),
};
function describeProjectInventory(check: DiscoveredProjectCheck) {
  const state = check.selection;
  let detail = "selected";
  if (state.state === "covered") {
    detail = `covered by ${state.by}`;
  } else if (state.state === "available") {
    detail = `available, not run: ${state.reason}`;
  }
  return `${check.id} [${check.categories.join(", ") || "aggregate"}]: ${detail}`;
}
const check = Command.make(
  "check",
  {
    ...flags,
    keepGoing: Flag.Boolean("keep-going").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Continue after individual check failures; cancellation and global deadlines still stop execution"
      )
    ),
  },
  Effect.fn("projectCheckCommand")(function* check({
    project,
    config,
    json,
    keepGoing,
  }) {
    const report = yield* runProjectChecks({
      keep_going: keepGoing,
      project,
      ...(Option.isSome(config) ? { config: config.value } : {}),
    });
    if (json) {
      yield* Console.log(JSON.stringify(report, null, 2));
    } else {
      yield* Console.log(`Project: ${report.project}`);
      for (const candidate of report.discovered) {
        yield* Console.log(describeProjectInventory(candidate));
      }
      for (const result of report.checks) {
        yield* Console.log(
          `${result.status.toUpperCase()} ${result.id} (${result.duration_ms}ms)`
        );
        if (result.status !== "passed" && result.status !== "not_run") {
          yield* Console.error(
            result.stderr ||
              result.stdout ||
              "Check did not complete successfully."
          );
        }
      }
      yield* Console.log(`Selected suite result: ${report.outcome}`);
      if (report.diagnostic) {
        yield* Console.error(report.diagnostic);
      }
    }
    process.exitCode = report.exit_code;
  })
).pipe(
  Command.withDescription(
    "Run selected mandatory local checks and report available checks separately"
  )
);
const inspect = Command.make(
  "inspect",
  flags,
  Effect.fn("projectInspectCommand")(function* inspect({
    project,
    config,
    json,
  }) {
    const plan = yield* inspectProjectChecks({
      project,
      ...(Option.isSome(config) ? { config: config.value } : {}),
    }).pipe(
      Effect.catch((error) =>
        Effect.succeed({
          checks: [],
          diagnostic: error.message,
          discovered: [],
          exit_code: 2,
          notes: [],
          project,
        })
      )
    );
    if (json) {
      yield* Console.log(JSON.stringify(plan, null, 2));
    } else {
      yield* Console.log(`Project: ${plan.project}`);
      for (const candidate of plan.discovered) {
        yield* Console.log(describeProjectInventory(candidate));
      }
      yield* Console.log(
        `Planned checks: ${plan.checks.map((item) => item.id).join(", ")}`
      );
      if ("diagnostic" in plan) {
        yield* Console.error(plan.diagnostic);
      }
    }
    if ("exit_code" in plan) {
      process.exitCode = plan.exit_code;
    }
  })
).pipe(
  Command.withDescription(
    "Discover checks, selection reasons and local source evidence without executing the project"
  )
);
Command.make("project").pipe(
  Command.withDescription("Repository check discovery and execution"),
  Command.withSubcommands([check, inspect]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(NodeServices.layer),
  Effect.onInterrupt(() =>
    Console.error("Project checks cancelled; verification did not complete.")
  ),
  NodeRuntime.runMain
);
