import { lstat } from "node:fs/promises";
import { join } from "node:path";

/** Check for declared project metadata without following its contents. */
export async function projectFileExists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

/** Prefer the declared package manager, then a unique lockfile, otherwise conventional npm. */
export async function discoverProjectPackageManager(
  project: string,
  declared: string | undefined
) {
  const managers = ["npm", "pnpm", "yarn", "bun"];
  if (declared) {
    const [name] = declared.split("@");
    if (name && managers.includes(name)) {
      return name;
    }
    throw new Error(
      "PROJECT_CHECK_MANAGER: unsupported package manager; use explicit project-checks.json commands"
    );
  }
  const locks = await Promise.all(
    [
      ["npm", "package-lock.json"],
      ["pnpm", "pnpm-lock.yaml"],
      ["yarn", "yarn.lock"],
      ["bun", "bun.lock"],
      ["bun", "bun.lockb"],
    ].map(async ([manager, file]) =>
      manager && file && (await projectFileExists(join(project, file)))
        ? manager
        : null
    )
  );
  const found = [...new Set(locks.filter((manager) => manager !== null))];
  if (found.length > 1) {
    throw new Error(
      "PROJECT_CHECK_MANAGER: ambiguous lockfiles; declare packageManager or explicit check commands"
    );
  }
  return found[0] ?? "npm";
}
