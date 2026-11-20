import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { createShipCommand } from "../module-port.js";
import type { ShipHost } from "../module-port.js";

const target = {
  branch: "topic",
  cwd: "/task",
  defaultBranch: "main",
  head: "A",
  project: "/task",
  remote: "origin",
  repository: "https://gitlab.test/team/app",
  targetBranch: "main",
  title: "Change",
};
const ready = {
  draft: true,
  head_sha: "A",
  iid: 9,
  source_branch: "topic",
  target_branch: "main",
  url: "https://gitlab.test/team/app/-/merge_requests/9",
};
const pipeline = { id: 10, ref: "topic", sha: "A", state: "success" };
function fixture(mode = "") {
  const calls: string[] = [];
  let reviewReads = 0;
  let scopeReads = 0;
  let head = "A";
  let retried = false;
  const host: ShipHost = {
    authorize: () => Promise.resolve(mode !== "denied"),
    check: () => {
      calls.push("check");
      return Promise.resolve(mode !== "check-failed");
    },
    commit: () => {
      calls.push("commit");
      return Promise.resolve(head);
    },
    create: () => {
      calls.push("draft");
      return Promise.resolve(ready);
    },
    decide: () => {
      calls.push("decide");
      if (mode === "transient") {
        return Promise.resolve({ kind: "retry" });
      }
      if (mode === "feedback") {
        return Promise.resolve({
          body: "Covered by the null-input test.",
          disposition: "addressed",
          kind: "reply",
          threadId: "thread",
        });
      }
      if (mode === "repair") {
        head = "B";
        return Promise.resolve({ kind: "repair" });
      }
      if (mode === "open") {
        return Promise.resolve({
          body: "This requires a product decision.",
          disposition: "declined",
          kind: "reply",
          threadId: "thread",
        });
      }
      return Promise.resolve({ kind: "stop" });
    },
    markReady: (_target, _iid, expected) => {
      calls.push(`ready:${expected}`);
      return Promise.resolve({ ...ready, draft: false, head_sha: expected });
    },
    observe: () => {
      calls.push("observe");
      reviewReads += 1;
      const thread = {
        author: "Reviewer",
        body: "Fix the null case",
        id: "thread",
      };
      const threads =
        mode === "open" ||
        ((mode === "feedback" || mode === "repair") && reviewReads === 1)
          ? [thread]
          : [];
      const observed =
        mode === "stale" ||
        (mode === "repair" && head === "B" && reviewReads === 2)
          ? "old-head"
          : head;
      const ciState = mode === "transient" && !retried ? "failed" : "success";
      return Promise.resolve({
        complete: true,
        mr: { ...ready, head_sha: head },
        pipeline: {
          ...pipeline,
          sha: observed,
          state: mode === "pending" ? "running" : ciState,
        },
        requiredJobsReady: mode !== "missing-jobs",
        threads,
      });
    },
    preflight: () => {
      calls.push("guard");
      return Promise.resolve(mode === "reuse" ? ready : null);
    },
    prepare: (_target, paths) => {
      calls.push("scope");
      scopeReads += 1;
      return Promise.resolve({
        fingerprint:
          mode === "scope-changed" && scopeReads > 1 ? "changed" : "scope",
        hasChanges: paths.length > 0,
        paths,
      });
    },
    push: (_target, pushed) => {
      calls.push(`push:${pushed}`);
      return Promise.resolve();
    },
    reply: (_target, _iid, decision) => {
      calls.push(`reply:${decision.disposition}`);
      return Promise.resolve("91");
    },
    resolve: () => {
      calls.push("resolve");
      return Promise.resolve(target);
    },
    retry: () => {
      calls.push("retry");
      retried = true;
      return Promise.resolve("10");
    },
    transient: () => {
      calls.push("diagnose");
      return Promise.resolve(mode === "transient");
    },
    wait: () => {
      calls.push("wait");
      return Promise.resolve();
    },
  };
  return { calls, run: createShipCommand(host) };
}
contractTest("ship.explicit", async () => {
  const { run, calls } = fixture("denied");
  const result = await run({ approved: true });
  expect(result.status).toBe("blocked");
  expect(calls).toHaveLength(0);
  expect((await run({})).status).toBe("blocked");
  expect(calls).not.toContain("push:A");
});
contractTest("ship.scope", async () => {
  const { run, calls } = fixture();
  expect((await run({ task_paths: ["../file"] })).status).toBe("blocked");
  expect(calls).toHaveLength(0);
  const stopped = fixture("check-failed");
  expect((await stopped.run({ task_paths: ["only.ts"] })).error?.code).toBe(
    "LOCAL_CHECK_FAILED"
  );
  expect(stopped.calls).not.toContain("commit");
  const changed = fixture("scope-changed");
  expect((await changed.run({ task_paths: ["only.ts"] })).error?.code).toBe(
    "SCOPE_CHANGED"
  );
  expect(changed.calls).not.toContain("push:A");
});
contractTest("ship.delivery", async () => {
  const { run, calls } = fixture("reuse");
  expect((await run({})).data).toMatchObject({
    merge_request: { iid: 9 },
    state: "ready_for_review",
  });
  expect(calls).not.toContain("draft");
  expect(calls).toContain("push:A");
});
contractTest("ship.ready", async () => {
  const { run, calls } = fixture();
  const result = await run({ commit_message: "Task", task_paths: ["only.ts"] });
  expect(result.data).toMatchObject({
    commits_created: ["A"],
    head_sha: "A",
    pushed_sha: "A",
    state: "ready_for_review",
  });
  const missing = fixture("missing-jobs");
  expect((await missing.run({})).status).toBe("partial");
  expect(missing.calls).not.toContain("ready:A");
  expect(calls).toStrictEqual([
    "resolve",
    "scope",
    "check",
    "scope",
    "guard",
    "commit",
    "push:A",
    "guard",
    "draft",
    "observe",
    "observe",
    "ready:A",
  ]);
});
contractTest("ship.feedback", async () => {
  const accepted = fixture("feedback");
  expect((await accepted.run({})).status).toBe("ok");
  expect(accepted.calls).toContain("reply:addressed");
  const declined = fixture("open");
  const result = await declined.run({});
  expect(result.data?.blockers).toContainEqual({
    category: "REVIEW_DECISION_REQUIRED",
    message: "This requires a product decision.",
    resource: "thread",
  });
  expect(declined.calls).toContain("reply:declined");
  expect(declined.calls).not.toContain("ready:A");
});
contractTest("ship.freshness", async () => {
  const { run, calls } = fixture("repair");
  const result = await run({ commit_message: "Task", task_paths: ["only.ts"] });
  expect(result.data).toMatchObject({
    fix_rounds: 1,
    head_sha: "B",
    state: "ready_for_review",
  });
  expect(calls).toContain("wait");
  expect(calls).toContain("ready:B");
  expect(calls).not.toContain("ready:A");
});
contractTest("ship.bounds", async () => {
  const stopped = new AbortController();
  const { run, calls } = fixture("pending");
  const result = await run({}, { maxPolls: 1, signal: stopped.signal });
  expect(result.data).toMatchObject({
    blockers: [{ category: "CI_UNAVAILABLE" }],
    pushed_sha: "A",
  });
  expect(calls.filter((call) => call === "wait")).toHaveLength(1);
  const repair = fixture("repair");
  expect((await repair.run({ max_fix_rounds: 0 })).error?.code).toBe(
    "REPAIR_LIMIT"
  );
  stopped.abort();
  expect((await run({}, { signal: stopped.signal })).status).toBe("cancelled");
});

contractTest("ship.retry", async () => {
  const { run, calls } = fixture("transient");
  const result = await run({});
  expect(result.status).toBe("ok");
  expect(
    calls.filter((operation) =>
      ["diagnose", "decide", "retry", "ready:A"].includes(operation)
    )
  ).toStrictEqual(["diagnose", "decide", "retry", "ready:A"]);
  const denied = fixture("transient");
  expect((await denied.run({ max_fix_rounds: 0 })).error?.code).toBe(
    "REPAIR_LIMIT"
  );
  expect(denied.calls).not.toContain("retry");
});
