import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { runProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

async function waitForProjectCheckMarker(path: string) {
  const until = Date.now() + 3000;
  while (Date.now() < until) {
    try {
      await access(path);
      return;
    } catch {
      await setTimeout(10);
    }
  }
  throw new Error("PROJECT_CHECK_TEST: command did not start");
}

contractTest("project-cli.cancellation", async () => {
  const f = await projectCheckFixture();
  const child =
    "setTimeout(()=>require('fs').writeFileSync('leaked-child','bad'),800)";
  const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'});require('fs').writeFileSync('started','yes');setInterval(()=>{},1000)`;
  await f.write("project-checks.json", {
    checks: [
      f.nodeCheck("first", "process.stdout.write('done')"),
      f.nodeCheck("running", parent, 5000),
      f.nodeCheck("later", "require('fs').writeFileSync('unexpected','bad')"),
    ],
  });
  const controller = new AbortController();
  const running = Effect.runPromise(
    runProjectChecks({ project: f.project }, { signal: controller.signal })
  );
  await waitForProjectCheckMarker(join(f.project, "started"));
  controller.abort();
  const result = await running;
  expect(result.exit_code).toBe(130);
  expect(result.checks.map((c) => c.status)).toStrictEqual([
    "passed",
    "cancelled",
    "not_run",
  ]);
  expect(result.checks[0]?.stdout).toBe("done");
  await setTimeout(950);
  await expect(access(join(f.project, "leaked-child"))).rejects.toThrow(
    /ENOENT/u
  );
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
  const again = await Effect.runPromise(
    runProjectChecks({ project: f.project }, { signal: controller.signal })
  );
  expect(again.checks.map((c) => c.status)).toStrictEqual([
    "cancelled",
    "not_run",
    "not_run",
  ]);
  await expect(readFile(join(f.project, "started"), "utf-8")).resolves.toBe(
    "yes"
  );
  const expired = await Effect.runPromise(
    runProjectChecks({ project: f.project }, { deadline: Date.now() - 1 })
  );
  expect(expired.checks.map((c) => c.status)).toStrictEqual([
    "timed_out",
    "not_run",
    "not_run",
  ]);
});
