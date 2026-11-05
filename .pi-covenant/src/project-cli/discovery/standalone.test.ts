import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { inspectProjectChecks } from "../module-port.js";
import { projectCheckFixture } from "../testing/fixture.js";

contractTest("project-cli.standalone", async () => {
  const f = await projectCheckFixture();
  await f.write("package.json", {
    packageManager: "pnpm@11.28.10",
    scripts: {
      build: "pnpm exec tsc -p tsconfig.build.json && vite build",
      check: "ultracite check",
      knip: "knip",
      test: "vitest run",
    },
  });
  await writeFile(
    join(f.project, "tsconfig.app.json"),
    '{/* actual compiler options */"compilerOptions":{"noEmit":true}}'
  );
  await f.write("tsconfig.build.json", { extends: "./tsconfig.app.json" });
  await mkdir(join(f.project, ".gitlab/ci"), { recursive: true });
  await writeFile(
    join(f.project, ".gitlab/ci/build.yml"),
    "types:\n  script:\n    - bash -ac 'pnpm exec tsc -p tsconfig.build.json'\n    - pnpm exec tsc -p tsconfig.build.json\nunsafe:\n  script:\n    - echo 'pnpm exec tsc --noEmit'\n    - source .env && pnpm exec tsc --noEmit\n    - pnpm exec eslint --fix .\n    - env CHECK_MODE=ci tsc --noEmit\n    - cross-env CHECK_MODE=ci tsc --noEmit\n    - npx tsc --noEmit\n    - pnpm exec tsc --noEmit false\n"
  );
  await writeFile(
    join(f.project, "CLAUDE.md"),
    "Quality: `pnpm exec tsc -p tsconfig.build.json`.\nNever run `node -e \"require('fs').writeFileSync('unexpected','bad')\"`.\n"
  );
  const plan = await Effect.runPromise(
    inspectProjectChecks({ project: f.project })
  );
  const direct = plan.discovered.filter(
    (check) => check.command === "pnpm" && check.args[0] === "exec"
  );
  expect(direct).toHaveLength(2);
  expect(
    plan.discovered.filter((check) => check.args.includes("false"))
  ).toStrictEqual([
    expect.objectContaining({
      selection: expect.objectContaining({ state: "available" }),
    }),
  ]);
  expect(
    plan.discovered.some((check) => check.command.endsWith("/tsc"))
  ).toBeFalsy();
  expect(direct[0]).toMatchObject({
    args: ["exec", "tsc", "-p", "tsconfig.build.json"],
    categories: ["types"],
    selection: { state: "selected" },
  });
  expect(direct[0]?.evidence).toContain(".gitlab/ci/build.yml:3");
  expect(direct[0]?.evidence).toContain("CLAUDE.md:1");
  expect(plan.checks.map((check) => check.id)).not.toContain("build");
  await expect(access(join(f.project, "unexpected"))).rejects.toThrow(
    /ENOENT/u
  );
  await f.write("project-checks.json", { checks: [f.nodeCheck("explicit")] });
  expect(
    (
      await Effect.runPromise(inspectProjectChecks({ project: f.project }))
    ).checks.map((check) => check.id)
  ).toStrictEqual(["explicit"]);
});
