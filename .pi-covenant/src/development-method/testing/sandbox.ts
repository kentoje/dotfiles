import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Disposable verification input copy; dependencies are shared, never mutated. */
export async function withVerificationSandbox<T>(
  root: string,
  run: (sandbox: string) => Promise<T>
): Promise<T> {
  const sandbox = await mkdtemp(join(tmpdir(), "covenant-dev-verification-"));
  try {
    await Promise.all(
      [
        "architecture",
        "models",
        "bin",
        "scripts",
        "contracts",
        "src",
        "tools",
        "commands",
        "capabilities",
      ].map((directory) =>
        cp(join(root, directory), join(sandbox, directory), { recursive: true })
      )
    );
    await Promise.all(
      [
        "package.json",
        "pnpm-lock.yaml",
        "tsconfig.json",
        "vitest.config.ts",
        "covenant.yaml",
        "design.yaml",
        ".fallowrc.json",
      ].map((file) => cp(join(root, file), join(sandbox, file)))
    );
    await symlink(
      join(root, "node_modules"),
      join(sandbox, "node_modules"),
      "dir"
    );
    return await run(sandbox);
  } finally {
    await rm(sandbox, { force: true, recursive: true });
  }
}
