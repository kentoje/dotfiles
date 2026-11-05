import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.check-tools", async () => {
  const f = await projectCheckFixture();
  await f.write("package.json", {
    scripts: {
      browsers: "pnpm exec playwright install-deps",
      check: "ultracite check",
      e2e: "playwright test",
      "e2e:codegen": "playwright codegen",
      "e2e:ui": "playwright test --ui",
      knip: "knip",
      playwright: "playwright",
      "playwright:install": "playwright install",
    },
  });
  const plan = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  expect(plan.checks.map((check) => check.id)).toStrictEqual(["check", "knip"]);
  expect(plan.discovered.find((check) => check.id === "knip")).toMatchObject({
    categories: ["dead-code"],
    selection: { state: "selected" },
  });
  for (const id of [
    "playwright",
    "playwright:install",
    "e2e:codegen",
    "browsers",
  ]) {
    expect(plan.discovered.find((check) => check.id === id)).toMatchObject({
      categories: ["setup"],
      selection: { state: "available" },
    });
  }
  expect(
    plan.discovered.find((check) => check.id === "e2e")?.categories
  ).toStrictEqual(["e2e"]);
  expect(
    plan.discovered.find((check) => check.id === "e2e:ui")?.categories
  ).toStrictEqual(["e2e"]);
});
