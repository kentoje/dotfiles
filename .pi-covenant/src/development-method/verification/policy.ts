import { Schema } from "effect";

import type { DevelopmentCommandResult } from "./command.js";

const receiptSchema = Schema.Struct({
  report: Schema.Struct({
    obligations: Schema.Array(Schema.Struct({ outcome: Schema.String })),
    outcome: Schema.String,
    run_id: Schema.NonEmptyString,
    scope: Schema.String,
    tests: Schema.Array(Schema.Struct({ outcome: Schema.String })),
  }),
  stale: Schema.Boolean,
});
/** Require every declared check and current, nonempty, passing full-project native evidence. */
export function assessDevelopmentResults(
  expected: readonly string[],
  results: readonly DevelopmentCommandResult[],
  rawReceipt: unknown,
  inputs: { before: string; after: string }
): boolean {
  if (!inputs.before || inputs.before !== inputs.after) {
    return false;
  }
  if (
    !expected.length ||
    new Set(expected).size !== expected.length ||
    results.length !== expected.length ||
    new Set(results.map((result) => result.id)).size !== results.length ||
    results.some(
      (result) =>
        !expected.includes(result.id) ||
        result.status !== "passed" ||
        result.code !== 0 ||
        result.truncated
    )
  ) {
    return false;
  }
  try {
    const receipt = Schema.decodeUnknownSync(receiptSchema)(rawReceipt);
    return (
      !receipt.stale &&
      receipt.report.scope === "all" &&
      receipt.report.outcome === "pass" &&
      receipt.report.tests.length > 0 &&
      receipt.report.tests.every((test) => test.outcome === "passed") &&
      receipt.report.obligations.some(
        (obligation) => obligation.outcome === "verified"
      ) &&
      receipt.report.obligations.every((obligation) =>
        [
          "verified",
          "draft",
          "deprecated",
          "retired",
          "not_applicable",
        ].includes(obligation.outcome)
      )
    );
  } catch {
    return false;
  }
}
