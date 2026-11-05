import { contractTest } from "@covenant/vitest";
import { describe, expect } from "vitest";

import type { DevelopmentCommandResult } from "./command.js";
import { assessDevelopmentResults as assess } from "./policy.js";

function assessDevelopmentResults(
  expected: string[],
  results: DevelopmentCommandResult[],
  receipt: unknown
) {
  return assess(expected, results, receipt, {
    after: "fixture",
    before: "fixture",
  });
}

describe("development result acceptance", () => {
  contractTest("development.result-policy", () => {
    const result = {
      code: 0,
      durationMs: 1,
      id: "check",
      status: "passed",
      stderr: "",
      stdout: "",
      truncated: false,
    } satisfies DevelopmentCommandResult;
    const receipt = {
      report: {
        obligations: [{ outcome: "verified" }],
        outcome: "pass",
        run_id: "fixture",
        scope: "all",
        tests: [{ outcome: "passed" }],
      },
      stale: false,
    };
    expect(assessDevelopmentResults(["check"], [result], receipt)).toBeTruthy();
    expect(
      assessDevelopmentResults(["check", "missing"], [result], receipt)
    ).toBeFalsy();
    expect(
      assessDevelopmentResults(
        ["check"],
        [{ ...result, status: "failed" }],
        receipt
      )
    ).toBeFalsy();
    expect(
      assessDevelopmentResults(["check"], [result], { ...receipt, stale: true })
    ).toBeFalsy();
    expect(
      assessDevelopmentResults(["check"], [result], {
        ...receipt,
        report: { ...receipt.report, scope: "component:worktree" },
      })
    ).toBeFalsy();
    expect(assessDevelopmentResults(["check"], [result], {})).toBeFalsy();
    expect(
      assess(["check"], [result], receipt, { after: "new", before: "old" })
    ).toBeFalsy();
  });
});
