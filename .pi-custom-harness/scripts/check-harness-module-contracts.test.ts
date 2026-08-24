import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import { validateHarnessModuleContracts } from "./check-harness-module-contracts";

const temporaryDirectories: string[] = [];

const validPurpose = (name: string): string => `# ${name}

## Intent
Provide the ${name} module.

## Contract
Input and output are defined by the module core.

## Behaviour
Run the module behaviour.

## Edge cases
- Invalid input is rejected.

## Non-goals
This module does not own unrelated behaviour.

## Evidence
The module is required by the current harness.
`;

const createFile = async (root: string, path: string, contents: string): Promise<void> => {
  const filePath = join(root, path);
  await mkdir(join(filePath, ".."), { recursive: true });
  await writeFile(filePath, contents, "utf8");
};

const createValidFixture = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "pi-custom-harness-contracts-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "lib", "shared"), { recursive: true });
  await mkdir(join(root, "extensions", "handler"), { recursive: true });
  await mkdir(join(root, "extensions", "tool"), { recursive: true });

  await Promise.all([
    createFile(root, "lib/shared/.purpose", validPurpose("shared")),
    createFile(root, "lib/shared/core.ts", "export const shared = true;\n"),
    createFile(root, "lib/shared/core.test.ts", "export {};\n"),
    createFile(root, "extensions/handler/.purpose", validPurpose("handler")),
    createFile(root, "extensions/handler/core.ts", "export const handler = true;\n"),
    createFile(root, "extensions/handler/core.test.ts", "export {};\n"),
    createFile(root, "extensions/handler/index.ts", "export default function handler(): void {}\n"),
    createFile(root, "extensions/tool/.purpose", validPurpose("tool")),
    createFile(root, "extensions/tool/core.ts", "export const tool = true;\n"),
    createFile(root, "extensions/tool/core.test.ts", "export {};\n"),
    createFile(root, "extensions/tool/schema.ts", "export const ToolSchema = {};\n"),
    createFile(
      root,
      "extensions/tool/index.ts",
      "export default function register(pi: { registerTool(): void }): void { pi.registerTool(); }\n",
    ),
  ]);
  return root;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("validateHarnessModuleContracts", () => {
  test("accepts valid current module shapes without requiring future modules", async () => {
    const root = await createValidFixture();

    await expect(validateHarnessModuleContracts(root)).resolves.toEqual({
      issues: [],
    });
  });

  test("reports actionable issues for malformed modules", async () => {
    const root = await createValidFixture();
    await mkdir(join(root, "extensions", "malformed"), { recursive: true });
    await Promise.all([
      createFile(
        root,
        "extensions/malformed/.purpose",
        "# malformed\n\n## Intent\nOnly one section.\n",
      ),
      createFile(
        root,
        "extensions/malformed/core.ts",
        'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";\nexport const malformed = true;\n',
      ),
    ]);

    const report = await validateHarnessModuleContracts(root);
    const messages = report.issues.map(({ message }) => message).join("\n");

    expect(report.issues.length).toBeGreaterThan(0);
    expect(messages).toContain("headings must be exactly");
    expect(messages).toContain("missing colocated test coverage");
    expect(messages).toContain("must not import @earendil-works/pi-coding-agent");
  });

  test("requires schema and index only when an extension is a registered tool", async () => {
    const root = await createValidFixture();
    await rm(join(root, "extensions", "tool", "schema.ts"));

    const report = await validateHarnessModuleContracts(root);

    expect(report.issues.map(({ message }) => message)).toContain(
      "registered tool extension is missing schema.ts",
    );
  });
});
