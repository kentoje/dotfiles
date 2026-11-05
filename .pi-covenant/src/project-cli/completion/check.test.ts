import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.completion", async () => {
  const f = await projectCheckFixture();
  await f.write("project-checks.json", {
    checks: [
      f.nodeCheck("first", "require('fs').writeFileSync('order','A')"),
      f.nodeCheck(
        "second",
        "const fs=require('fs');if(fs.readFileSync('order','utf8')!=='A')process.exit(9);fs.appendFileSync('order','B')"
      ),
    ],
  });
  const result = await Effect.runPromise(
    runProjectChecks({ project: f.project })
  );
  expect(result.outcome).toBe("pass");
  expect(result.exit_code).toBe(0);
  expect(result.checks.map((c) => c.status)).toStrictEqual([
    "passed",
    "passed",
  ]);
  await expect(readFile(join(f.project, "order"), "utf-8")).resolves.toBe("AB");
});
