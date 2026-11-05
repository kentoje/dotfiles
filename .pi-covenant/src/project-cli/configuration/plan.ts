import { realpath, stat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { Schema } from "effect";

import type { DiscoveredProjectCheck } from "../discovery/model.js";

const argument = Schema.String.check(Schema.isPattern(/^[^\0]*$/u));
const checkSchema = Schema.Struct({
  args: Schema.Array(argument),
  command: Schema.NonEmptyString.check(Schema.isPattern(/^[^\0]*\S[^\0]*$/u)),
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  id: Schema.NonEmptyString.check(
    Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9:._-]{0,79}$/u)
  ),
  timeout_ms: Schema.optionalKey(
    Schema.Int.check(
      Schema.isGreaterThan(0),
      Schema.isLessThanOrEqualTo(3_600_000)
    )
  ),
});
const configuration = Schema.Struct({
  checks: Schema.NonEmptyArray(checkSchema),
});

/** Configuration errors block execution before any mandatory command starts. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect TaggedError is a superclass factory, not an error instance.
export class ProjectCheckError extends Schema.TaggedError<ProjectCheckError>()(
  "ProjectCheckError",
  { message: Schema.String }
) {}

/** User-selected execution policy is validated independently of trusted host cancellation. */
export const projectCheckRunRequestSchema = Schema.Struct({
  config: Schema.optionalKey(Schema.NonEmptyString),
  keep_going: Schema.optionalKey(Schema.Boolean),
  project: Schema.NonEmptyString,
});
/** Runtime-validated check request; fail-fast remains the default. */
export type ProjectCheckRunRequest = typeof projectCheckRunRequestSchema.Type;

/** Executable argument vector and canonical working directory for one required check. */
export interface ProjectCheckSpec {
  id: string;
  command: string;
  args: readonly string[];
  cwd: string;
  timeout_ms: number;
}

/** Fully resolved mandatory check plan, derived without executing project code. */
export interface ProjectCheckPlan {
  project: string;
  source: string;
  checks: ProjectCheckSpec[];
  discovered: DiscoveredProjectCheck[];
  notes: string[];
}

/** Restrict discovered files and working directories to the selected canonical project. */
export async function resolveProjectCheckPath(project: string, path: string) {
  const resolved = await realpath(resolve(project, path));
  const offset = relative(project, resolved);
  if (offset === ".." || offset.startsWith("../") || isAbsolute(offset)) {
    throw new Error("PROJECT_CHECK_PATH: path leaves the selected project");
  }
  return resolved;
}

/** Bound static configuration reads and reject redirected or non-file inputs. */
export async function readProjectCheckJson(
  project: string,
  path: string
): Promise<unknown> {
  const resolved = await resolveProjectCheckPath(project, path);
  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size > 1_048_576) {
    throw new Error(
      "PROJECT_CHECK_CONFIG: expected a JSON file of at most 1 MiB"
    );
  }
  return JSON.parse(await readFile(resolved, "utf-8"));
}

/** Decode all required checks and validate every working directory before dispatch. */
export async function decodeProjectCheckPlan(
  project: string,
  source: string,
  value: unknown
): Promise<ProjectCheckPlan> {
  const decoded = Schema.decodeUnknownSync(configuration, {
    onExcessProperty: "error",
  })(value);
  if (
    decoded.checks.length > 64 ||
    new Set(decoded.checks.map((check) => check.id)).size !==
      decoded.checks.length
  ) {
    throw new Error(
      "PROJECT_CHECK_CONFIG: require 1..64 unique mandatory checks"
    );
  }
  const checks = await Promise.all(
    decoded.checks.map(async (check) => {
      const cwd = await resolveProjectCheckPath(project, check.cwd ?? ".");
      const metadata = await stat(cwd);
      if (!metadata.isDirectory()) {
        throw new Error(
          "PROJECT_CHECK_CWD: working directory is not a directory"
        );
      }
      return { ...check, cwd, timeout_ms: check.timeout_ms ?? 60_000 };
    })
  );
  return { checks, discovered: [], notes: [], project, source };
}
