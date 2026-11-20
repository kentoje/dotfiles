import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { projectCheckFixture } from "../testing/fixture.js";

const execute = promisify(execFile);
const executable = fileURLToPath(
  new URL("../../../bin/project", import.meta.url)
);

contractTest("project-profile.reviewed-write", async () => {
  const fixture = await projectCheckFixture();
  const path = join(fixture.project, "project-checks.json");
  const invoke = async (...args: string[]) =>
    JSON.parse(
      (
        await execute(executable, [
          ...args,
          "--project",
          fixture.project,
          "--json",
        ])
      ).stdout
    );

  await fixture.write("package.json", {
    scripts: { test: "node --version", "test:e2e": "false" },
  });
  const first = await invoke("propose");
  expect(first.checks.map((check: { id: string }) => check.id)).toStrictEqual([
    "test",
  ]);
  await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });

  await fixture.write("package.json", {
    scripts: { test: "node -v", "test:e2e": "false" },
  });
  await expect(
    invoke("apply", "--proposal", first.proposal_id)
  ).rejects.toMatchObject({ code: 2 });
  await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });

  const next = await invoke("propose");
  expect(next.proposal_id).not.toBe(first.proposal_id);
  await expect(
    invoke("apply", "--proposal", next.proposal_id)
  ).resolves.toMatchObject({ state: "saved" });
  await expect(invoke("check")).resolves.toMatchObject({ outcome: "pass" });

  await fixture.write("package.json", {
    scripts: { test: "node --version", "test:e2e": "false" },
  });
  const review = await invoke("maintain");
  expect(review.state).toBe("update");
  await expect(
    invoke("apply", "--proposal", review.proposal_id)
  ).resolves.toMatchObject({ state: "saved" });

  const edited = JSON.stringify({ checks: [fixture.nodeCheck("custom")] });
  await fixture.write("project-checks.json", JSON.parse(edited));
  await expect(
    invoke("apply", "--proposal", review.proposal_id)
  ).rejects.toMatchObject({ code: 2 });
  await expect(readFile(path, "utf-8")).resolves.toBe(edited);
});
