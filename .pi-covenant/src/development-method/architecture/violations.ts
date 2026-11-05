import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { withVerificationSandbox } from "../testing/sandbox.js";
import { checkModuleContracts } from "./check.js";

async function replaceContractFragment(
  root: string,
  name: string,
  original: string,
  replacement: string
) {
  const file = join(root, name);
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  const source = await readFile(file, "utf-8");
  if (!source.includes(original)) {
    throw new Error(`PROBE_TARGET_MISSING: ${name}`);
  }
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await writeFile(file, source.replace(original, replacement));
}
async function injectImport(root: string, specifier: string) {
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await mkdir(join(root, "src/fleet"), { recursive: true });
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await mkdir(join(root, "src/gitlab"), { recursive: true });
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await writeFile(
    join(root, "src/gitlab/private.ts"),
    "export const privateValue = 1;\n"
  );
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await writeFile(
    join(root, "src/fleet/probe.ts"),
    `import { privateValue } from ${JSON.stringify(specifier)};\nexport const probeValue = privateValue;\n`
  );
}
/** Execute negative architecture checks without editing the real repository or prior evidence. */
export async function rejectContractMutations(root: string) {
  const cases = [
    {
      code: "UNKNOWN_PORT",
      mutate: (sandbox: string) =>
        replaceContractFragment(
          sandbox,
          "architecture/modules/fleet.json",
          '"gitlab": ["repository"]',
          '"gitlab": ["invented_operation"]'
        ),
    },
    {
      code: "PORT_COVERAGE",
      mutate: (sandbox: string) =>
        replaceContractFragment(
          sandbox,
          "architecture/modules/fleet.json",
          '"consumes": {',
          '"consumes": { "jira": ["get"],'
        ),
    },
    {
      code: "DEPENDENCY_CYCLE",
      mutate: (sandbox: string) =>
        replaceContractFragment(
          sandbox,
          "architecture/modules/tool-protocol.json",
          '"dependencies": []',
          '"dependencies": ["foundation"]'
        ),
    },
    {
      code: "FIXTURE_MISMATCH",
      mutate: (sandbox: string) =>
        replaceContractFragment(
          sandbox,
          "architecture/fixtures/mr--status.json",
          '"payload": {',
          '"payload": [], "original_payload": {'
        ),
    },
    {
      code: "UNDECLARED_IMPORT",
      mutate: (sandbox: string) =>
        injectImport(sandbox, "../worktree/model.js"),
    },
    {
      code: "PRIVATE_MODULE_IMPORT",
      mutate: (sandbox: string) =>
        injectImport(sandbox, "../gitlab/private.js"),
    },
    {
      code: "PRIVATE_MODULE_IMPORT",
      mutate: async (sandbox: string) => {
        // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
        await replaceContractFragment(
          sandbox,
          "tsconfig.json",
          '"compilerOptions": {',
          '"compilerOptions": { "baseUrl": ".", "paths": { "@provider/*": ["src/gitlab/*"] },'
        );
        // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
        await injectImport(sandbox, "@provider/private");
      },
    },
  ];
  for (const probe of cases) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    await withVerificationSandbox(root, async (sandbox) => {
      // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
      await probe.mutate(sandbox);
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
        await checkModuleContracts(sandbox);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith(probe.code)) {
          return;
        }
        throw error;
      }
      throw new Error(`MUTATION_SURVIVED: ${probe.code}`);
    });
  }
  return cases.length;
}
