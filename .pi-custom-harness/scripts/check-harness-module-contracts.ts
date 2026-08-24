import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_PURPOSE_HEADINGS = [
  "Intent",
  "Contract",
  "Behaviour",
  "Edge cases",
  "Non-goals",
  "Evidence",
] as const;
const PI_PACKAGE = "@earendil-works/pi-coding-agent";
const PI_IMPORT_PATTERN = new RegExp(
  `(from\\s*[\\\"']${PI_PACKAGE}\\s*[\\\"']|import\\s+(?:type\\s+)?[\\\"']${PI_PACKAGE}\\s*[\\\"']|import\\s*\\(\\s*[\\\"']${PI_PACKAGE}\\s*[\\\"'])`,
);
const TOOL_REGISTRATION_PATTERN = /\bregisterTool\s*\(/;

type ModuleKind = "library" | "extension";

interface ModuleDirectory {
  readonly kind: ModuleKind;
  readonly name: string;
  readonly path: string;
}

export interface ModuleContractIssue {
  readonly module: string;
  readonly message: string;
}

export interface ModuleContractReport {
  readonly issues: readonly ModuleContractIssue[];
}

const compareNames = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const displayPath = (rootDirectory: string, targetPath: string): string => {
  const path = relative(rootDirectory, targetPath).split(sep).join("/");
  return path.length === 0 ? "." : path;
};

const makeIssue = (
  rootDirectory: string,
  targetPath: string,
  message: string,
): ModuleContractIssue => ({
  module: displayPath(rootDirectory, targetPath),
  message,
});

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    return (await stat(targetPath)).isFile();
  } catch {
    return false;
  }
};

const directoryNames = async (directoryPath: string): Promise<readonly string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareNames);
};

const sourceFiles = async (directoryPath: string): Promise<readonly string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) => compareNames(left.name, right.name))) {
    const entryPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await sourceFiles(entryPath)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      paths.push(entryPath);
    }
  }
  return paths;
};

const inspectPurpose = async (
  rootDirectory: string,
  module: ModuleDirectory,
): Promise<ModuleContractIssue[]> => {
  const purposePath = join(module.path, ".purpose");
  if (!(await pathExists(purposePath))) {
    return [
      makeIssue(
        rootDirectory,
        module.path,
        "missing .purpose; add the module contract with the six required headings",
      ),
    ];
  }

  let contents: string;
  try {
    contents = await readFile(purposePath, "utf8");
  } catch (error: unknown) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    return [makeIssue(rootDirectory, purposePath, `cannot read .purpose${reason}`)];
  }

  const lines = contents.split(/\r?\n/);
  const issues: ModuleContractIssue[] = [];
  const firstContentLine = lines.find((line) => line.trim().length > 0)?.trim();
  if (firstContentLine !== `# ${module.name}`) {
    issues.push(
      makeIssue(rootDirectory, purposePath, `first heading must be "# ${module.name}"`),
    );
  }

  const headingLines = lines.flatMap((line, index) => {
    const heading = /^##\s+(.+?)\s*$/.exec(line.trim())?.[1];
    return heading === undefined ? [] : [{ index, heading }];
  });
  const headings = headingLines.map(({ heading }) => heading);
  const validHeadings =
    headings.length === REQUIRED_PURPOSE_HEADINGS.length &&
    headings.every((heading, index) => heading === REQUIRED_PURPOSE_HEADINGS[index]);
  if (!validHeadings) {
    issues.push(
      makeIssue(
        rootDirectory,
        purposePath,
        `headings must be exactly: ${REQUIRED_PURPOSE_HEADINGS.map((heading) => `## ${heading}`).join(", ")}`,
      ),
    );
  }

  for (const expectedHeading of REQUIRED_PURPOSE_HEADINGS) {
    const headingLine = headingLines.find(({ heading }) => heading === expectedHeading);
    if (headingLine === undefined) continue;
    const nextHeadingLine = headingLines.find(({ index }) => index > headingLine.index);
    const sectionEnd = nextHeadingLine?.index ?? lines.length;
    const sectionBody = lines.slice(headingLine.index + 1, sectionEnd).join("\n").trim();
    if (sectionBody.length === 0) {
      issues.push(
        makeIssue(
          rootDirectory,
          purposePath,
          `section "${expectedHeading}" must not be empty`,
        ),
      );
    }
  }
  return issues;
};

const inspectModuleShape = async (
  rootDirectory: string,
  module: ModuleDirectory,
): Promise<ModuleContractIssue[]> => {
  const entries = await readdir(module.path, { withFileTypes: true });
  const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const issues = await inspectPurpose(rootDirectory, module);

  if (!files.has("core.ts")) {
    issues.push(makeIssue(rootDirectory, module.path, "missing core.ts for the module Effect core"));
  }
  if (![...files].some((file) => /\.(?:test|spec)\.(?:ts|tsx)$/.test(file))) {
    issues.push(makeIssue(rootDirectory, module.path, "missing colocated test coverage (*.test.ts or *.spec.ts)"));
  }

  const hasIndex = files.has("index.ts");
  const hasSchema = files.has("schema.ts");
  if (module.kind === "extension" && hasIndex) {
    const indexPath = join(module.path, "index.ts");
    let indexContents = "";
    try {
      indexContents = await readFile(indexPath, "utf8");
    } catch (error: unknown) {
      const reason = error instanceof Error ? `: ${error.message}` : "";
      issues.push(makeIssue(rootDirectory, indexPath, `cannot read index.ts${reason}`));
    }
    if (TOOL_REGISTRATION_PATTERN.test(indexContents)) {
      if (!hasSchema) {
        issues.push(makeIssue(rootDirectory, module.path, "registered tool extension is missing schema.ts"));
      }
    }
  }
  return issues;
};

const inspectPiImports = async (
  rootDirectory: string,
  moduleRoots: readonly string[],
): Promise<ModuleContractIssue[]> => {
  const issues: ModuleContractIssue[] = [];
  for (const moduleRoot of moduleRoots) {
    for (const moduleName of await directoryNames(moduleRoot)) {
      const modulePath = join(moduleRoot, moduleName);
      const isPiBridge = basename(moduleRoot) === "lib" && moduleName === "pi-bridge";
      for (const filePath of await sourceFiles(modulePath)) {
        if (isPiBridge || (basename(moduleRoot) === "extensions" && basename(filePath) !== "core.ts")) continue;
        if (PI_IMPORT_PATTERN.test(await readFile(filePath, "utf8"))) {
          issues.push(
            makeIssue(
              rootDirectory,
              filePath,
              `must not import ${PI_PACKAGE}; keep Pi imports at the extension index or lib/pi-bridge boundary`,
            ),
          );
        }
      }
    }
  }
  return issues;
};

const inspectRoot = async (
  rootDirectory: string,
  name: string,
  kind: ModuleKind,
): Promise<{ readonly modules: readonly ModuleDirectory[]; readonly issues: readonly ModuleContractIssue[] }> => {
  const rootPath = join(rootDirectory, name);
  try {
    return {
      modules: (await directoryNames(rootPath)).map((moduleName) => ({
        kind,
        name: moduleName,
        path: join(rootPath, moduleName),
      })),
      issues: [],
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    return {
      modules: [],
      issues: [makeIssue(rootDirectory, rootPath, `cannot inspect module directory${reason}`)],
    };
  }
};

export const validateHarnessModuleContracts = async (
  rootDirectory: string,
): Promise<ModuleContractReport> => {
  const resolvedRoot = resolve(rootDirectory);
  const [libraries, extensions] = await Promise.all([
    inspectRoot(resolvedRoot, "lib", "library"),
    inspectRoot(resolvedRoot, "extensions", "extension"),
  ]);
  const modules = [...libraries.modules, ...extensions.modules].sort((left, right) =>
    compareNames(displayPath(resolvedRoot, left.path), displayPath(resolvedRoot, right.path)),
  );
  const issues = [
    ...libraries.issues,
    ...extensions.issues,
    ...(await Promise.all(modules.map((module) => inspectModuleShape(resolvedRoot, module)))).flat(),
  ];
  if (libraries.issues.length === 0 && extensions.issues.length === 0) {
    issues.push(
      ...(await inspectPiImports(resolvedRoot, [join(resolvedRoot, "lib"), join(resolvedRoot, "extensions")])),
    );
  }
  return { issues };
};

const main = async (): Promise<void> => {
  const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const report = await validateHarnessModuleContracts(rootDirectory);
  if (report.issues.length === 0) {
    console.log("Harness module contracts valid.");
    return;
  }
  console.error("Harness module contract validation failed:");
  for (const contractIssue of report.issues) {
    console.error(`- ${contractIssue.module}: ${contractIssue.message}`);
  }
  process.exitCode = 1;
};

if (import.meta.main) await main();
