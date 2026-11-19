import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { evaluateJiraDuplicates } from "./module-port.js";

contractTest("preflight.policy", () => {
  const input = {
    candidates: [
      { key: "APP-1", state: "Closed", summary: "Ｆix   THE bug" },
      { key: "APP-2", state: "Open", summary: "Fix the larger bug" },
    ],
    complete: true,
    issue_type: "10",
    project: "APP",
    site: "https://jira.test",
    summary: "fix the bug",
  };
  const checked = evaluateJiraDuplicates(input).data;
  expect(checked).toMatchObject({
    decision: "duplicate_decision_required",
    matches: ["APP-1"],
  });
  expect(
    evaluateJiraDuplicates({
      ...input,
      candidates: [...input.candidates].toReversed(),
    }).data
  ).toStrictEqual(checked);
  for (const changed of [
    { project: "OTHER" },
    { summary: "Fix the bug" },
    { issue_type: "11" },
    { site: "https://other.test" },
    {
      candidates: [{ key: "APP-1", state: "Open", summary: "Ｆix   THE bug" }],
    },
  ]) {
    expect(
      evaluateJiraDuplicates({ ...input, ...changed }).data?.proposal_identity
    ).not.toBe(checked?.proposal_identity);
  }
  expect(
    evaluateJiraDuplicates({ ...input, complete: false }).data?.decision
  ).toBe("blocked");
});
