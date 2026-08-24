import { expect, test } from "bun:test";
import { Value } from "typebox/value";

import { WorktreeParams } from "./schema";

test("accepts safe worktree task names without regex lookaround", () => {
  expect(Value.Check(WorktreeParams, { action: "new", task: "CI-6618" })).toBe(
    true,
  );
  expect(
    Value.Check(WorktreeParams, { action: "rm", task: "feature_fix" }),
  ).toBe(true);
});

test("rejects path separator task names while core rejects dot paths", () => {
  expect(
    Value.Check(WorktreeParams, { action: "new", task: "feature/fix" }),
  ).toBe(false);
  expect(
    Value.Check(WorktreeParams, { action: "new", task: "feature\\fix" }),
  ).toBe(false);
  expect(Value.Check(WorktreeParams, { action: "new", task: "." })).toBe(true);
  expect(Value.Check(WorktreeParams, { action: "new", task: ".." })).toBe(true);
});
