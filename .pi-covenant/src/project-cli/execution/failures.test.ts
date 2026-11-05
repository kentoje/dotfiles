import { access } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.failures", async () => {
  const f = await projectCheckFixture();
  const outcomes = [
    {
      check: f.nodeCheck(
        "test",
        "process.stderr.write('assertion failed');process.exit(7)"
      ),
      status: "failed",
    },
    {
      check: {
        ...f.nodeCheck("missing"),
        command: "/no-such-project-check-command",
      },
      status: "unavailable",
    },
    {
      check: f.nodeCheck("slow", "setInterval(()=>{},1000)", 50),
      status: "timed_out",
    },
  ];
  for (const { check, status } of outcomes) {
    await f.write("project-checks.json", {
      checks: [
        check,
        f.nodeCheck("later", "require('fs').writeFileSync('unexpected','bad')"),
      ],
    });
    const result = await Effect.runPromise(
      runProjectChecks({ project: f.project })
    );
    expect(result.exit_code).toBe(1);
    expect(result.checks.map((c) => c.status)).toStrictEqual([
      status,
      "not_run",
    ]);
    expect(result.checks[0]?.stdout.length).toBeLessThanOrEqual(65_536);
  }
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
});
