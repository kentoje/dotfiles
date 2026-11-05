import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.coverage", async () => {
  const f = await projectCheckFixture();
  const scripts = {
    check: "pnpm run lint && pnpm run types && pnpm test && pnpm fallow",
    fallow: "fallow dead-code",
    lint: "eslint .",
    test: "vitest run",
    types: "tsc --noEmit",
  };
  await f.write("package.json", { packageManager: "pnpm@10.15.1", scripts });
  const aggregate = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(aggregate.checks.map((c) => c.id)).toStrictEqual(["check"]);
  expect(
    aggregate.discovered.find((c) => c.id === "types")?.selection
  ).toStrictEqual({ by: "check", state: "covered" });
  await f.write("package.json", {
    packageManager: "pnpm@10.15.1",
    scripts: { ...scripts, check: "echo 'pnpm run types && pnpm test'" },
  });
  const echoed = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(echoed.checks.map((c) => c.id)).toStrictEqual([
    "check",
    "types",
    "lint",
    "test",
    "fallow",
  ]);
  await f.write("package.json", {
    packageManager: "pnpm@10.15.1",
    scripts: { ...scripts, check: "pnpm run types || true" },
  });
  const ignoredFailure = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(ignoredFailure.checks.map((c) => c.id)).toContain("types");
  await f.write("package.json", {
    scripts: { check: "npm run verify", verify: "npm run check" },
  });
  await expect(
    Effect.runPromise(inspectProjectChecks({ project: f.project }))
  ).rejects.toThrow(/PROJECT_CHECK_RECURSION/u);
  await f.write("project-checks.json", { checks: [f.nodeCheck("chosen")] });
  const explicit = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(explicit.checks.map((c) => c.id)).toStrictEqual(["chosen"]);
});
