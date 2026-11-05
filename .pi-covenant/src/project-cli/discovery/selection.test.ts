import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks, runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

const execute = promisify(execFile);
const executable = fileURLToPath(
  new URL("../../../bin/project", import.meta.url)
);
contractTest("project-cli.selection", async () => {
  const f = await projectCheckFixture();
  await f.write("package.json", {
    scripts: {
      build: `node -e "throw Error('do not build by default')"`,
      e2e: `node -e "require('fs').writeFileSync('e2e-ran','yes')"`,
      test: 'node -e "process.exit(0)"',
    },
  });
  const plan = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(plan.checks.map((c) => c.id)).toStrictEqual(["test"]);
  const run = await Effect.runPromise(runProjectChecks({ project: f.project }));
  expect(run.discovered.find((c) => c.id === "e2e")?.selection.state).toBe(
    "available"
  );
  await expect(access(join(f.project, "e2e-ran"))).rejects.toThrow(/ENOENT/u);
  const inspection = await execute(executable, [
    "inspect",
    "--project",
    f.project,
    "--json",
  ]);
  expect(JSON.parse(inspection.stdout)).toMatchObject({
    checks: [{ id: "test" }],
    discovered: expect.arrayContaining([
      expect.objectContaining({ id: "e2e" }),
    ]),
    project: f.project,
  });
  await f.write("package.json", {
    scripts: {
      e2e: `node -e "require('fs').writeFileSync('e2e-ran','yes')"`,
    },
  });
  const onlyE2E = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(onlyE2E.discovered.map((item) => item.id)).toStrictEqual(["e2e"]);
  expect(
    (await Effect.runPromise(runProjectChecks({ project: f.project })))
      .exit_code
  ).toBe(2);
  await f.write("project-checks.json", {
    checks: [
      {
        args: ["run", "e2e"],
        command: "npm",
        id: "chosen-e2e",
        timeout_ms: 5000,
      },
    ],
  });
  const explicit = await Effect.runPromise(
    runProjectChecks({ project: f.project })
  );
  expect(explicit.checks.map((c) => c.id)).toStrictEqual(["chosen-e2e"]);
  expect(explicit.discovered.find((c) => c.id === "e2e")?.selection.state).toBe(
    "selected"
  );
  await expect(readFile(join(f.project, "e2e-ran"), "utf-8")).resolves.toBe(
    "yes"
  );
});
