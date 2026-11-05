import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { projectCheckFixture } from "./testing/fixture.js";

const execute = promisify(execFile);
const executable = fileURLToPath(new URL("../../bin/project", import.meta.url));

contractTest("project-cli.cli", async () => {
  const f = await projectCheckFixture();
  await f.write("project-checks.json", { checks: [f.nodeCheck("test")] });
  const success = await execute(
    executable,
    ["check", "--project", f.project, "--json"],
    { cwd: f.project }
  );
  expect(JSON.parse(success.stdout)).toMatchObject({
    checks: [{ id: "test", status: "passed" }],
    exit_code: 0,
    outcome: "pass",
    project: f.project,
  });
  await f.write("project-checks.json", {
    checks: [
      f.nodeCheck(
        "test",
        "process.stderr.write('test failed');process.exit(3)"
      ),
    ],
  });
  await expect(
    execute(executable, ["check", "--project", f.project, "--json"], {
      cwd: f.project,
    })
  ).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining('"outcome": "fail"'),
  });
  await f.write("project-checks.json", { checks: [] });
  await expect(
    execute(executable, ["check", "--project", f.project, "--json"], {
      cwd: f.project,
    })
  ).rejects.toMatchObject({ code: 2 });
});
