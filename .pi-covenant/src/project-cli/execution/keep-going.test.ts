import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

const execute = promisify(execFile);
const executable = fileURLToPath(
  new URL("../../../bin/project", import.meta.url)
);
contractTest("project-cli.keep-going", async () => {
  const f = await projectCheckFixture();
  await f.write("project-checks.json", {
    checks: [
      f.nodeCheck("bad", "process.exit(5)"),
      f.nodeCheck("good"),
      { ...f.nodeCheck("missing"), command: "/no-such-keep-going-command" },
      f.nodeCheck("slow", "setInterval(()=>{},1000)", 40),
      f.nodeCheck("last", "require('fs').writeFileSync('completed','yes')"),
    ],
  });
  const result = await Effect.runPromise(
    runProjectChecks({ keep_going: true, project: f.project })
  );
  expect(result.exit_code).toBe(1);
  expect(result.keep_going).toBeTruthy();
  expect(result.checks.map((check) => check.status)).toStrictEqual([
    "failed",
    "passed",
    "unavailable",
    "timed_out",
    "passed",
  ]);
  await expect(readFile(join(f.project, "completed"), "utf-8")).resolves.toBe(
    "yes"
  );
  const normal = await Effect.runPromise(
    runProjectChecks({ project: f.project })
  );
  expect(normal.checks.map((check) => check.status)).toStrictEqual([
    "failed",
    "not_run",
    "not_run",
    "not_run",
    "not_run",
  ]);
  await expect(
    execute(executable, [
      "check",
      "--project",
      f.project,
      "--keep-going",
      "--json",
    ])
  ).rejects.toMatchObject({
    code: 1,
    stdout: expect.stringContaining('"keep_going": true'),
  });
  await f.write("project-checks.json", {
    checks: [f.nodeCheck("ok1"), f.nodeCheck("ok2")],
  });
  expect(
    (
      await Effect.runPromise(
        runProjectChecks({ keep_going: true, project: f.project })
      )
    ).exit_code
  ).toBe(0);
  await f.write("project-checks.json", {
    checks: [
      f.nodeCheck(
        "running",
        "require('fs').writeFileSync('started','ready');setInterval(()=>{},1000)",
        5000
      ),
      f.nodeCheck("later", "require('fs').writeFileSync('unexpected','bad')"),
    ],
  });
  const controller = new AbortController();
  const running = Effect.runPromise(
    runProjectChecks(
      { keep_going: true, project: f.project },
      { signal: controller.signal }
    )
  );
  try {
    await expect
      .poll(() => readFile(join(f.project, "started"), "utf-8"), {
        timeout: 3000,
      })
      .toBe("ready");
  } finally {
    controller.abort();
  }
  expect((await running).checks.map((check) => check.status)).toStrictEqual([
    "cancelled",
    "not_run",
  ]);
  const expired = await Effect.runPromise(
    runProjectChecks(
      { keep_going: true, project: f.project },
      { deadline: Date.now() - 1 }
    )
  );
  expect(expired.checks.map((check) => check.status)).toStrictEqual([
    "timed_out",
    "not_run",
  ]);
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
});
