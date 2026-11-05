import { readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { Schema } from "effect";
import ts from "typescript";

import { resolveProjectCheckPath } from "./plan.js";

const compilerConfig = Schema.Struct({
  compilerOptions: Schema.optionalKey(
    Schema.Struct({ noEmit: Schema.optionalKey(Schema.Boolean) })
  ),
  extends: Schema.optionalKey(Schema.String),
});

async function localNoEmit(
  project: string,
  file: string,
  seen: Set<string>
): Promise<boolean> {
  if (seen.size >= 8 || seen.has(file)) {
    return false;
  }
  seen.add(file);
  const path = await resolveProjectCheckPath(project, file);
  const info = await stat(path);
  if (!info.isFile() || info.size > 1_048_576) {
    return false;
  }
  const text = await readFile(path, "utf-8");
  if (Buffer.byteLength(text) > 1_048_576) {
    return false;
  }
  const parsed = ts.parseConfigFileTextToJson(path, text);
  if (parsed.error) {
    return false;
  }
  const value: unknown = parsed.config;
  const config = Schema.decodeUnknownSync(compilerConfig)(value);
  if (config.compilerOptions?.noEmit !== undefined) {
    return config.compilerOptions.noEmit;
  }
  if (!config.extends?.startsWith(".")) {
    return false;
  }
  return localNoEmit(
    project,
    relative(project, resolve(dirname(path), config.extends)),
    seen
  );
}

/** Only infer standalone compiler execution when literal flags or contained local config establish noEmit. */
export async function isReadOnlyCompilerCheck(project: string, args: string[]) {
  try {
    const index = args.findIndex((arg) => arg === "-p" || arg === "--project");
    const inline = args.find((arg) => arg.startsWith("--project="));
    const config =
      inline?.slice("--project=".length) ??
      (index === -1 ? "tsconfig.json" : args[index + 1]);
    if (!config) {
      return false;
    }
    if (index !== -1 || inline) {
      await resolveProjectCheckPath(project, config);
    }
    if (args.includes("--noEmit=false")) {
      return false;
    }
    if (args.includes("--noEmit")) {
      return (
        !args.includes("--noEmit=false") &&
        args[args.indexOf("--noEmit") + 1] !== "false"
      );
    }
    return await localNoEmit(project, config, new Set());
  } catch {
    return false;
  }
}
