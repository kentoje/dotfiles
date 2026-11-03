import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "../testing/fixture.js";

describe("worktree inspection", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.readiness-only", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "inspect" }));
    if (!created.data) {
      throw new Error("Missing path");
    }
    const module = makeWorktreeModule({
      ...f.host,
      requiredArtifacts: ["missing-install"],
      setup: { args: [], command: "must-never-execute", kind: "after-create" },
    });
    const result = await Effect.runPromise(
      module.verify({ path: created.data.path })
    );
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      worktree: { path: created.data.path, readiness: "unavailable" },
    });
    expect(result.data?.checks).toContainEqual({
      name: "missing-install",
      reason: "Missing setup artifact.",
      state: "missing",
    });
  });
});
