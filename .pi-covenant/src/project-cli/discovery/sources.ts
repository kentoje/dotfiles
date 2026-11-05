import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

async function readDiscoverySource(project: string, file: string) {
  try {
    const path = await realpath(join(project, file));
    const offset = relative(project, path);
    if (offset === ".." || offset.startsWith("../") || isAbsolute(offset)) {
      return null;
    }
    const info = await stat(path);
    if (!info.isFile() || info.size > 262_144) {
      return null;
    }
    return await readFile(path, "utf-8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function localCiFiles(
  project: string,
  directory: string,
  depth = 0
): Promise<string[]> {
  if (depth > 2) {
    return [];
  }
  try {
    const entries = await readdir(join(project, directory), {
      withFileTypes: true,
    });
    const batches = await Promise.all(
      entries
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .slice(0, 64)
        .map((entry) => {
          const file = join(directory, entry.name);
          if (entry.isSymbolicLink()) {
            return [];
          }
          if (entry.isDirectory()) {
            return localCiFiles(project, file, depth + 1);
          }
          return /\.ya?ml$/u.test(entry.name) ? [file] : [];
        })
    );
    return batches.flat().slice(0, 64);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  }
}

/** Local source text is bounded and never imported or executed during discovery. */
export interface ProjectDiscoverySource {
  file: string;
  text: string;
  kind: "ci" | "instructions" | "documentation" | "configuration";
}

/** Read deterministic local instruction/CI/config sources without remote includes or environment files. */
export async function readProjectDiscoverySources(
  project: string
): Promise<ProjectDiscoverySource[]> {
  const ci = await Promise.all([
    localCiFiles(project, ".gitlab/ci"),
    localCiFiles(project, ".github/workflows"),
  ]);
  const files = [
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    "CONTRIBUTING.md",
    ".gitlab-ci.yml",
    "playwright.config.ts",
    "playwright.config.js",
    "playwright.config.mts",
    "cypress.config.ts",
    ".fallowrc.json",
    "knip.json",
    "knip.jsonc",
    ".knip.json",
    ...ci.flat(),
  ].slice(0, 80);
  const sources = await Promise.all(
    files.map(async (file) => {
      const text = await readDiscoverySource(project, file);
      if (text === null) {
        return null;
      }
      let kind: ProjectDiscoverySource["kind"] = "configuration";
      if (file.endsWith(".yml") || file.endsWith(".yaml")) {
        kind = "ci";
      } else if (["AGENTS.md", "CLAUDE.md"].includes(file)) {
        kind = "instructions";
      } else if (file.endsWith(".md")) {
        kind = "documentation";
      }
      return { file, kind, text };
    })
  );
  return sources.flatMap((source) => (source ? [source] : []));
}
