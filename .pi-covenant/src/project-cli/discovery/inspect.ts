import { realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";

import {
  decodeProjectCheckPlan,
  ProjectCheckError,
  readProjectCheckJson,
} from "../configuration/plan.js";
import { addProjectDiscoveryEvidence } from "./evidence.js";
import {
  discoverProjectPackageManager,
  projectFileExists,
} from "./package-manager.js";
import { analyzeProjectScripts } from "./scripts.js";
import { selectProjectScripts } from "./select.js";
import { readProjectDiscoverySources } from "./sources.js";
import { addStandaloneProjectChecks } from "./standalone.js";

const requestSchema = Schema.Struct({
  config: Schema.optionalKey(Schema.NonEmptyString),
  project: Schema.NonEmptyString,
});
const packageSchema = Schema.Struct({
  packageManager: Schema.optionalKey(Schema.String),
  scripts: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

/** Inventory existing check commands and their selection evidence without running or writing project code. */
export const inspectProjectChecks = Effect.fn("inspectProjectChecks")(
  (input: unknown) =>
    Effect.tryPromise({
      catch: (error) =>
        new ProjectCheckError({
          message: `PROJECT_CHECK_CONFIG: ${error instanceof Error ? error.message : String(error)}`,
        }),
      try: async () => {
        const request = Schema.decodeUnknownSync(requestSchema, {
          onExcessProperty: "error",
        })(input);
        const project = await realpath(request.project);
        const root = await stat(project);
        if (!root.isDirectory()) {
          throw new Error("PROJECT_CHECK_ROOT: project must be a directory");
        }
        const source = request.config ?? "project-checks.json";
        const explicit =
          Boolean(request.config) ||
          (await projectFileExists(join(project, source)));
        const configured = explicit
          ? await decodeProjectCheckPlan(
              project,
              source,
              await readProjectCheckJson(project, source)
            )
          : null;
        let scripts: Record<string, string> = {};
        let manager = "npm";
        const notes: string[] = [];
        try {
          const pkg = Schema.decodeUnknownSync(packageSchema)(
            await readProjectCheckJson(project, "package.json")
          );
          scripts = pkg.scripts ?? {};
          manager = await discoverProjectPackageManager(
            project,
            pkg.packageManager
          );
        } catch (error) {
          if (!configured) {
            throw error;
          }
          notes.push(
            "Package inventory unavailable; the explicit configured suite remains authoritative."
          );
        }
        const analyses = analyzeProjectScripts(scripts);
        const selectedIds = configured
          ? new Set(
              configured.checks
                .filter(
                  (check) =>
                    check.command === manager &&
                    check.args[0] === "run" &&
                    check.args.length === 2
                )
                .flatMap((check) => (check.args[1] ? [check.args[1]] : []))
            )
          : undefined;
        const selection = selectProjectScripts(
          project,
          manager,
          analyses,
          selectedIds
        );
        const sources = await readProjectDiscoverySources(project);
        await addProjectDiscoveryEvidence(
          project,
          selection.discovered,
          sources
        );
        const base =
          configured ??
          (selection.ids.length
            ? await decodeProjectCheckPlan(project, "package.json", {
                checks: selection.ids.map((id) => ({
                  args: ["run", id],
                  command: manager,
                  id,
                  timeout_ms: analyses
                    .find((script) => script.id === id)
                    ?.categories.includes("unit")
                    ? 180_000
                    : 60_000,
                })),
              })
            : {
                checks: [],
                discovered: [],
                notes: [],
                project,
                source: "package.json",
              });
        const plan = {
          ...base,
          discovered: selection.discovered,
          notes: [
            ...notes,
            ...selection.notes,
            ...(configured
              ? [
                  "Explicit configuration selects the exact mandatory suite; other discovered checks are not execution evidence.",
                ]
              : []),
          ],
        };
        return addStandaloneProjectChecks(
          project,
          plan,
          sources,
          Boolean(configured)
        );
      },
    })
);
