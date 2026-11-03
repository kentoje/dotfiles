import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "../testing/fixture.js";

describe("worktree listing", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.lists-managed-only", async () => {
    const { mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "listed" }));
    await mkdir(join(f.root, "fixture", "unregistered"));
    f.git([
      "worktree",
      "add",
      "-b",
      "outside",
      join(f.temp, "outside"),
      "main",
    ]);
    const result = await Effect.runPromise(f.module.list({}));
    expect(result.status).toBe("ok");
    expect(result.data?.worktrees.map((entry) => entry.path)).toStrictEqual([
      created.data?.path,
    ]);
  });
});
