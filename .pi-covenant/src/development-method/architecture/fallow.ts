import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ModuleContracts } from "./model.js";
/** Derive module zones from the same dependencies validated by native contract metadata. */
export function createFallowBoundaries(modules: ModuleContracts) {
  return {
    coverage: { requireAllFiles: true },
    rules: [
      ...[...modules].map(([name, module]) => ({
        allow: [...module.dependencies],
        from: name,
      })),
      { allow: ["development-method"], from: "tooling" },
    ],
    zones: [
      ...[...modules.keys()].map((name) => ({
        name,
        patterns: [`src/${name}/**`],
      })),
      { name: "tooling", patterns: ["scripts/**", "*.config.ts"] },
    ],
  };
}
/** Prove the real Fallow binary rejects an undeclared crossing, rather than merely validating JSON. */
export async function verifyFallowBoundaryProbe(root: string) {
  const sandbox = await mkdtemp(join(tmpdir(), "covenant-fallow-boundary-"));
  try {
    await mkdir(join(sandbox, "src/a"), { recursive: true });
    await mkdir(join(sandbox, "src/b"), { recursive: true });
    await writeFile(
      join(sandbox, "package.json"),
      JSON.stringify({ name: "boundary-probe", private: true, type: "module" })
    );
    await writeFile(
      join(sandbox, "src/a/entry.ts"),
      "import { value } from '../b/private.js'; export const result = value;\n"
    );
    await writeFile(
      join(sandbox, "src/b/private.ts"),
      "export const value = 1;\n"
    );
    await writeFile(
      join(sandbox, ".fallowrc.json"),
      JSON.stringify({
        boundaries: {
          coverage: { requireAllFiles: true },
          rules: [{ allow: [], from: "a" }],
          zones: [
            { name: "a", patterns: ["src/a/**"] },
            { name: "b", patterns: ["src/b/**"] },
          ],
        },
        entry: ["src/a/entry.ts"],
      })
    );
    const result = spawnSync(
      join(root, "node_modules/.bin/fallow"),
      ["architecture", "--format", "json"],
      { cwd: sandbox, encoding: "utf-8", timeout: 10_000 }
    );
    return (
      result.status === 1 &&
      result.stdout.includes('"boundary_violations"') &&
      result.stdout.includes("src/a/entry.ts") &&
      result.stdout.includes("src/b/private.ts")
    );
  } finally {
    await rm(sandbox, { force: true, recursive: true });
  }
}
