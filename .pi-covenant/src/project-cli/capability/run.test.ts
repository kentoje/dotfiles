import { access } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectCapability, runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.optional-capabilities", async () => {
  const fixture = await projectCheckFixture();
  const marker = join(fixture.project, "story-invoked");
  await fixture.write("project-checks.json", {
    checks: [fixture.nodeCheck("test")],
  });
  await fixture.write("project-capabilities.json", {
    capabilities: [
      {
        ...fixture.nodeCheck(
          "story:show",
          "require('fs').writeFileSync('story-invoked', process.argv[1]); console.log(JSON.stringify({ story_id: process.argv[1] }));"
        ),
        accepts_arguments: true,
      },
      fixture.nodeCheck("preview:url", "console.log('http://localhost:4321')"),
      fixture.nodeCheck("e2e", "process.exit(17)"),
    ],
  });
  const run = (id: string, args: string[] = [], signal?: AbortSignal) =>
    Effect.runPromise(
      runProjectCapability(
        { arguments: args, capability_id: id, project: fixture.project },
        signal ? { signal } : {}
      )
    );

  await expect(
    Effect.runPromise(runProjectChecks({ project: fixture.project }))
  ).resolves.toMatchObject({ outcome: "pass" });
  await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(run("missing")).resolves.toMatchObject({ outcome: "blocked" });
  await expect(run("preview:url", ["unexpected"])).resolves.toMatchObject({
    outcome: "blocked",
  });
  await expect(
    run("story:show", ["editor--default"], AbortSignal.abort())
  ).resolves.toMatchObject({ outcome: "cancelled" });
  await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(run("story:show", ["editor--default"])).resolves.toMatchObject({
    outcome: "pass",
    result: { stdout: '{"story_id":"editor--default"}\n' },
  });
  await expect(run("e2e")).resolves.toMatchObject({
    exit_code: 17,
    outcome: "fail",
  });
});
