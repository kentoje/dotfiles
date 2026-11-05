import { access, mkdtemp, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.configuration", async () => {
  const f = await projectCheckFixture();
  const marker = f.nodeCheck(
    "first",
    "require('fs').writeFileSync('unexpected','bad')"
  );
  for (const checks of [
    [],
    [marker, marker],
    [marker, { ...f.nodeCheck("bad"), timeout_ms: 0 }],
    [marker, { ...f.nodeCheck("bad"), cwd: ".." }],
  ]) {
    await f.write("project-checks.json", { checks });
    const result = await Effect.runPromise(
      runProjectChecks({ project: f.project })
    );
    expect(result.exit_code).toBe(2);
    expect(result.checks).toStrictEqual([]);
  }
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
  const outside = await mkdtemp(join(tmpdir(), "project-outside-"));
  try {
    await symlink(outside, join(f.project, "escape"));
    await f.write("project-checks.json", {
      checks: [{ ...marker, cwd: "escape" }],
    });
    expect(
      (await Effect.runPromise(runProjectChecks({ project: f.project })))
        .exit_code
    ).toBe(2);
  } finally {
    await rm(outside, { force: true, recursive: true });
  }
});
