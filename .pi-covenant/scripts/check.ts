import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Effect } from "effect";

import {
  assessDevelopmentResults,
  runDevelopmentCommand,
  snapshotDevelopmentInputs,
} from "../src/development-method/module-port.js";
import type {
  DevelopmentCommand,
  DevelopmentCommandResult,
} from "../src/development-method/module-port.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = join(root, ".covenant/bin/covenant");
const binary =
  process.env.COVENANT_BIN ??
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  (await access(local).then(
    () => local,
    () => "covenant"
  ));
const steps: DevelopmentCommand[] = [
  {
    args: ["exec", "ultracite", "check"],
    command: "pnpm",
    id: "lint-format",
    timeout: 60_000,
  },
  {
    args: ["exec", "fallow", "dead-code"],
    command: "pnpm",
    id: "dead-code-boundaries",
    timeout: 60_000,
  },
  {
    args: ["run", "typecheck"],
    command: "pnpm",
    id: "typecheck",
    timeout: 60_000,
  },
  {
    args: ["run", "check:contracts"],
    command: "pnpm",
    id: "architecture",
    timeout: 60_000,
  },
  {
    args: ["--project", root, "--json", "validate"],
    command: binary,
    id: "native-validation",
    timeout: 30_000,
  },
  {
    args: ["--project", root, "--json", "design", "check"],
    command: binary,
    id: "design",
    timeout: 60_000,
  },
  {
    args: ["--project", root, "--json", "design", "check", "--faults"],
    command: binary,
    id: "design-faults",
    timeout: 60_000,
  },
  {
    args: ["--project", root, "--json", "design", "conformance"],
    command: binary,
    id: "behavior",
    timeout: 180_000,
  },
  {
    args: ["--project", root, "--json", "design", "conformance", "--status"],
    command: binary,
    id: "conformance-status",
    timeout: 30_000,
  },
  {
    args: ["--project", root, "--json", "status"],
    command: binary,
    id: "native-status",
    timeout: 30_000,
  },
];
const runId = `${Date.now()}-${randomUUID()}`;
const directory = join(root, ".covenant/dev-runs", runId);
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
await mkdir(directory, { recursive: true });
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
await writeFile(
  join(directory, "request.json"),
  JSON.stringify({ runId, steps }, null, 2),
  { flag: "wx" }
);
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
const before = await snapshotDevelopmentInputs(root);
const results: DevelopmentCommandResult[] = [];
let failed = false;
for (const step of steps) {
  console.log(`> ${step.id}`);
  const result: DevelopmentCommandResult = failed
    ? ({
        code: null,
        durationMs: 0,
        id: step.id,
        status: "not_run",
        stderr: "",
        stdout: "",
        truncated: false,
      } satisfies DevelopmentCommandResult)
    : // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
      await Effect.runPromise(runDevelopmentCommand(step, root));
  results.push(result);
  failed ||= result.status !== "passed";
  if (result.status !== "passed" && result.status !== "not_run") {
    console.error(
      result.stderr || result.stdout || `Failed to execute ${step.command}`
    );
  }
}
let receipt: unknown;
try {
  receipt = JSON.parse(
    results.find((result) => result.id === "native-status")?.stdout ?? ""
  );
} catch {
  receipt = null;
}
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
const after = await snapshotDevelopmentInputs(root);
const passed = assessDevelopmentResults(
  steps.map((step) => step.id),
  results,
  receipt,
  { after, before }
);
const report = JSON.stringify(
  {
    inputs: { after, before },
    nativeReceipt: receipt,
    passed,
    results,
    runId,
    runtime: process.version,
  },
  null,
  2
);
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
await writeFile(join(directory, "report.json"), report, { flag: "wx" });
// oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
await writeFile(
  join(directory, "checksum"),
  createHash("sha256").update(report).digest("hex"),
  { flag: "wx" }
);
console.log(
  JSON.stringify(
    {
      checks: results.map(({ id, status }) => ({ id, status })),
      evidence: join(directory, "report.json"),
      passed,
    },
    null,
    2
  )
);
process.exitCode = passed ? 0 : 1;
