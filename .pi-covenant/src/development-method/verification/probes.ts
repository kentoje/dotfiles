import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { Effect, Schema } from "effect";
import YAML from "yaml";

import { withVerificationSandbox } from "../testing/sandbox.js";
import { runDevelopmentCommand } from "./command.js";

const bindingsSchema = Schema.Struct({
  bindings: Schema.Array(
    Schema.Struct({
      adapter: Schema.String,
      id: Schema.String,
      obligation: Schema.String,
      tests: Schema.Array(Schema.String),
    })
  ),
  schema_version: Schema.Number,
});
const missingEvidenceSchema = Schema.Struct({
  report: Schema.Struct({
    outcome: Schema.String,
    tests: Schema.Array(
      Schema.Struct({ id: Schema.String, outcome: Schema.String })
    ),
  }),
});
/** Challenge the real tests and missing-evidence policy in disposable copies, never the working tree. */
export async function probeWorktreeContracts(root: string, binary: string) {
  const results: unknown[] = [];
  for (const fault of [
    {
      file: "src/worktree/removal/remove.ts",
      name: "bypass-ahead-protection",
      original: "if (Number(count) > 0)",
      replacement: "if (false)",
      test: "worktree.protects-ahead-and-unknown",
    },
    {
      file: "src/worktree/model.ts",
      name: "bypass-task-validation",
      original: "/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u",
      replacement: "/.*/u",
      test: "worktree.safe-creation",
    },
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- Each controlled mutation must complete before the next sandbox.
    await withVerificationSandbox(root, async (sandbox) => {
      const path = join(sandbox, fault.file);
      const source = await readFile(path, "utf-8");
      if (!source.includes(fault.original)) {
        throw new Error(`PROBE_TARGET_MISSING: ${fault.file}`);
      }
      await writeFile(path, source.replace(fault.original, fault.replacement));
      const result = await Effect.runPromise(
        runDevelopmentCommand(
          {
            args: [
              "run",
              "src/worktree",
              "-t",
              `covenant:${fault.test}`,
              "--reporter=dot",
            ],
            command: join(root, "node_modules/.bin/vitest"),
            id: fault.name,
            timeout: 60_000,
          },
          sandbox
        )
      );
      if (
        result.code !== 1 ||
        !`${result.stdout}${result.stderr}`.includes("AssertionError")
      ) {
        throw new Error(`PROBE_NOT_DETECTED: ${fault.name}`);
      }
      results.push({ detectedBy: fault.test, fault: fault.name, result });
    });
  }
  await withVerificationSandbox(root, async (sandbox) => {
    const path = join(sandbox, "contracts/worktree/verification.yaml");
    const document = Schema.decodeUnknownSync(bindingsSchema)(
      YAML.parse(await readFile(path, "utf-8"))
    );
    const [first] = document.bindings;
    if (!first) {
      throw new Error("Probe binding missing");
    }
    await writeFile(
      path,
      YAML.stringify({
        ...document,
        bindings: document.bindings.map((binding) =>
          binding === first
            ? { ...binding, tests: ["worktree.nonexistent-evidence"] }
            : binding
        ),
      })
    );
    const result = await Effect.runPromise(
      runDevelopmentCommand(
        {
          args: [
            "--project",
            sandbox,
            "--json",
            "check",
            "--obligation",
            "WORKTREE-001",
          ],
          command: binary,
          id: "missing-executable-evidence",
          timeout: 90_000,
        },
        sandbox
      )
    );
    const receipt = Schema.decodeUnknownSync(
      Schema.fromJsonString(missingEvidenceSchema)
    )(result.stdout);
    if (
      result.code === 0 ||
      receipt.report.outcome === "pass" ||
      !receipt.report.tests.some(
        (test) =>
          test.id === "worktree.nonexistent-evidence" &&
          test.outcome === "missing_evidence"
      )
    ) {
      throw new Error("Missing evidence incorrectly accepted");
    }
    results.push({ fault: "missing-executable-evidence", result });
  });
  const directory = join(
    root,
    ".covenant/probes",
    `${Date.now()}-${randomUUID()}`
  );
  await mkdir(directory, { recursive: true });
  const evidence = join(directory, "worktree-probes.json");
  await writeFile(evidence, JSON.stringify(results, null, 2), { flag: "wx" });
  return { deliberateViolationsRejected: results.length, evidence };
}
