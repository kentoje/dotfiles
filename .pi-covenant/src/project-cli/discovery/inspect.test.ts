import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.discovery", async () => {
  const f = await projectCheckFixture();
  await f.write("package.json", {
    packageManager: "pnpm@10.15.1",
    scripts: {
      build: "build",
      check: "node -e \"require('fs').writeFileSync('unexpected','bad')\"",
      lint: "lint",
      test: "tests",
      "test:e2e": "e2e",
      typecheck: "types",
    },
  });
  const before = await readFile(join(f.project, "package.json"), "utf-8");
  const aggregate = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(aggregate.checks.map((c) => [c.id, c.command, c.args])).toStrictEqual([
    ["check", "pnpm", ["run", "check"]],
    ["typecheck", "pnpm", ["run", "typecheck"]],
    ["lint", "pnpm", ["run", "lint"]],
    ["test", "pnpm", ["run", "test"]],
  ]);
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
  await expect(
    readFile(join(f.project, "package.json"), "utf-8")
  ).resolves.toBe(before);
  await f.write("package.json", {
    packageManager: "npm@11.0.0",
    scripts: {
      build: "build",
      lint: "lint",
      test: "tests",
      "test:e2e": "e2e",
      typecheck: "types",
    },
  });
  const minimal = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(minimal.checks.map((c) => c.id)).toStrictEqual([
    "typecheck",
    "lint",
    "test",
  ]);
  await f.write("project-checks.json", { checks: [f.nodeCheck("custom")] });
  const explicit = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(explicit.checks.map((c) => c.id)).toStrictEqual(["custom"]);
});
