import { expect, test } from "bun:test";

import type { VerifyReport } from "./core";
import { createVerifyExecutionCoordinator } from "./execution";

const completedReport = (worktree: string): VerifyReport => ({
  ok: true,
  status: "completed",
  worktree,
  failures: [],
  duration: 1,
});

test("reuses verification for an unchanged worktree snapshot", async () => {
  const coordinator = createVerifyExecutionCoordinator();
  let executions = 0;
  const snapshot = {
    action: "test" as const,
    worktree: "/worktree",
    file: "/worktree/src/feature.test.ts",
    fingerprint: "head\nstatus",
  };
  const execute = () => {
    executions += 1;
    return Promise.resolve(completedReport("/worktree"));
  };

  await coordinator.run({ snapshot, execute });
  await coordinator.run({ snapshot, execute });

  expect(executions).toBe(1);
});

test("serializes different verification snapshots", async () => {
  const coordinator = createVerifyExecutionCoordinator();
  const first = Promise.withResolvers<VerifyReport>();
  const order: string[] = [];

  const firstRun = coordinator.run({
    snapshot: {
      action: "test",
      worktree: "/one",
      file: "/one/a.test.ts",
      fingerprint: "one",
    },
    execute: () => {
      order.push("first-start");
      return first.promise.then((report) => {
        order.push("first-end");
        return report;
      });
    },
  });
  const secondRun = coordinator.run({
    snapshot: {
      action: "test",
      worktree: "/two",
      file: "/two/b.test.ts",
      fingerprint: "two",
    },
    execute: () => {
      order.push("second-start");
      return Promise.resolve(completedReport("/two"));
    },
  });
  await Promise.resolve();
  expect(order).toEqual(["first-start"]);

  first.resolve(completedReport("/one"));
  await Promise.all([firstRun, secondRun]);

  expect(order).toEqual(["first-start", "first-end", "second-start"]);
});

test("does not cache interrupted verification", async () => {
  const coordinator = createVerifyExecutionCoordinator();
  let executions = 0;
  const snapshot = {
    action: "all" as const,
    worktree: "/worktree",
    file: undefined,
    fingerprint: "snapshot",
  };
  const execute = () => {
    executions += 1;
    return Promise.resolve({
      ...completedReport("/worktree"),
      ok: false,
      status: "interrupted" as const,
    });
  };

  await coordinator.run({ snapshot, execute });
  await coordinator.run({ snapshot, execute });

  expect(executions).toBe(2);
});
