import { expect, test } from "bun:test";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const harnessRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const commandPath = join(harnessRoot, "bin/mr-guard");

test("exposes the protected merge-request creation command", async () => {
  await access(commandPath, constants.X_OK);

  const result = Bun.spawnSync([commandPath, "--help"], {
    cwd: harnessRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "mr-guard [glab mr create options]",
  );
});
