import { glob, lstat, readFile, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, matchesGlob } from "node:path";

import { parse } from "yaml";

import type { FleetRepository } from "../../fleet/module-port.js";

function fleetObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
function relativeFleetPath(path: string) {
  return (
    !isAbsolute(path) &&
    !path.includes("\\") &&
    [...path].every((character) => (character.codePointAt(0) ?? 0) >= 32) &&
    path
      .split("/")
      .every(
        (part) => part && ![".", "..", ".git", "node_modules"].includes(part)
      )
  );
}
async function readFleetFile(root: string, path: string, signal: AbortSignal) {
  if (!relativeFleetPath(path)) {
    throw new Error("MANIFEST_UNAVAILABLE");
  }
  const file = join(root, path);
  const info = await lstat(file);
  if (
    !info.isFile() ||
    info.size > 1_048_576 ||
    (await realpath(file)) !== file
  ) {
    throw new Error("MANIFEST_UNAVAILABLE");
  }
  return readFile(file, { encoding: "utf-8", signal });
}
async function readNodeManifest(
  root: string,
  path: string,
  signal: AbortSignal
) {
  if (basename(path) !== "package.json") {
    throw new Error("MANIFEST_UNSUPPORTED");
  }
  const content = await readFleetFile(root, path, signal).catch(() => {
    throw new Error("MANIFEST_UNAVAILABLE");
  });
  try {
    const json: unknown = JSON.parse(content);
    const manifest = fleetObject(json);
    if (manifest) {
      return manifest;
    }
  } catch {
    // Treat invalid JSON and non-object JSON as malformed declarations.
  }
  throw new Error("MANIFEST_INVALID");
}
function workspacePatterns(value: unknown) {
  if (value === undefined) {
    return [];
  }
  if (
    !Array.isArray(value) ||
    value.length > 100 ||
    !value.every(
      (path: unknown): path is string =>
        typeof path === "string" && relativeFleetPath(path.replace(/^!/u, ""))
    )
  ) {
    throw new Error("MANIFEST_INVALID");
  }
  return value;
}
async function pnpmWorkspacePatterns(root: string, signal: AbortSignal) {
  try {
    const content = await readFleetFile(root, "pnpm-workspace.yaml", signal);
    const raw: unknown = parse(content, { maxAliasCount: 0 });
    const config = fleetObject(raw);
    if (!config) {
      throw new Error("MANIFEST_INVALID");
    }
    return workspacePatterns(config.packages);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw new Error("MANIFEST_INVALID", { cause: error });
  }
}
async function discoverFleetManifests(
  root: string,
  manifest: Record<string, unknown>,
  signal: AbortSignal
) {
  const fromPackage = Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : fleetObject(manifest.workspaces)?.packages;
  if (manifest.workspaces !== undefined && fromPackage === undefined) {
    throw new Error("MANIFEST_INVALID");
  }
  const paths = [
    ...workspacePatterns(fromPackage),
    ...(await pnpmWorkspacePatterns(root, signal)),
  ];
  const excluded = paths
    .filter((path) => path.startsWith("!"))
    .map((path) => path.slice(1));
  const included = paths
    .filter((path) => !path.startsWith("!"))
    .map((path) => `${path}/package.json`);
  const discovered = new Set<string>();
  let scanned = 0;
  for await (const path of glob(included, {
    cwd: root,
    exclude: (entry) => {
      signal.throwIfAborted();
      scanned += 1;
      if (scanned > 10_000) {
        throw new Error("MANIFEST_UNAVAILABLE");
      }
      return entry
        .split("/")
        .some((part) => part === "node_modules" || part === ".git");
    },
  })) {
    signal.throwIfAborted();
    if (
      !excluded.some((pattern) =>
        matchesGlob(path.slice(0, -"/package.json".length), pattern)
      )
    ) {
      discovered.add(path);
      if (discovered.size > 200) {
        throw new Error("MANIFEST_UNAVAILABLE");
      }
    }
  }
  return [
    "package.json",
    ...[...discovered].filter((path) => path !== "package.json").toSorted(),
  ];
}
function extractFleetDeclarations(
  path: string,
  manifest: Record<string, unknown>,
  pkg: string
) {
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const tokens = sections.flatMap((section) => {
    const values = fleetObject(manifest[section]);
    if (manifest[section] !== undefined && !values) {
      throw new Error("MANIFEST_INVALID");
    }
    if (!values || !Object.hasOwn(values, pkg)) {
      return [];
    }
    const spec = values[pkg];
    if (typeof spec !== "string" || !spec) {
      throw new Error("MANIFEST_INVALID");
    }
    return [{ manifest: path, section, spec }];
  });
  if (
    manifest.name === pkg &&
    typeof manifest.version === "string" &&
    manifest.version
  ) {
    tokens.push({ manifest: path, section: "version", spec: manifest.version });
  }
  return tokens;
}

export async function readFleetVersions(
  repo: FleetRepository,
  pkg: string,
  signal: AbortSignal
) {
  try {
    const root = await realpath(repo.path);
    const top = repo.manifests
      ? null
      : await readNodeManifest(root, "package.json", signal);
    const manifests_read = repo.manifests
      ? [...new Set(repo.manifests)]
      : await discoverFleetManifests(root, top ?? {}, signal);
    const declarations = [];
    for (const path of manifests_read) {
      const cached = path === "package.json" ? top : null;
      // oxlint-disable-next-line no-await-in-loop -- Keep reads bounded and preserve manifest order.
      const manifest = cached ?? (await readNodeManifest(root, path, signal));
      declarations.push(...extractFleetDeclarations(path, manifest, pkg));
    }
    return {
      data: {
        declarations,
        manifests_read,
        missing: declarations.length === 0,
      },
      errors: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = ["MANIFEST_INVALID", "MANIFEST_UNSUPPORTED"].includes(message)
      ? message
      : "MANIFEST_UNAVAILABLE";
    return {
      data: null,
      errors: [
        {
          code,
          message:
            "Unable to establish package declarations from the selected manifest set.",
        },
      ],
    };
  }
}
