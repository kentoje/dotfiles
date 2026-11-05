import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.inventory", async () => {
  const f = await projectCheckFixture();
  await f.write("package.json", {
    packageManager: "pnpm@11.28.9",
    scripts: {
      build: "rsbuild build",
      check: "ultracite check",
      e2e: "playwright test --workers=1",
      "e2e:ui": "playwright test --ui",
      fallow: "fallow dead-code",
      fix: "ultracite fix",
      test: "rstest",
      "test:coverage": "rstest --coverage",
      "ts:check": "tsgo --noEmit",
    },
  });
  await writeFile(
    join(f.project, "AGENTS.md"),
    "Required: `pnpm ts:check` and `pnpm check`.\n"
  );
  await writeFile(
    join(f.project, "playwright.config.ts"),
    "throw new Error('discovery must not import this config');\n"
  );
  await mkdir(join(f.project, ".gitlab/ci"), { recursive: true });
  await writeFile(
    join(f.project, ".gitlab/ci/checks.yml"),
    "job:\n  script:\n    - pnpm --config.store-dir=.pnpm-store run fallow\n"
  );
  const plan = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(plan.checks.map((c) => c.id)).toStrictEqual([
    "check",
    "ts:check",
    "test",
    "fallow",
  ]);
  expect(plan.discovered.find((c) => c.id === "e2e")).toMatchObject({
    categories: ["e2e"],
    selection: { state: "available" },
  });
  expect(
    plan.discovered.find((c) => c.id === "check")?.categories
  ).toStrictEqual(["lint", "format"]);
  expect(plan.discovered.find((c) => c.id === "ts:check")?.evidence).toContain(
    "AGENTS.md:1"
  );
  expect(plan.discovered.find((c) => c.id === "fallow")?.evidence).toContain(
    ".gitlab/ci/checks.yml:3"
  );
  expect(plan.discovered.find((c) => c.id === "e2e")?.evidence).toContain(
    "playwright.config.ts"
  );
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
});
