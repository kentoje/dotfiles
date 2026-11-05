import {
  unwrapProjectCommand,
  classifyProjectCommand,
  parseProjectCheckCommands,
  isNonAutomaticCheckCommand,
} from "./commands.js";
import type { ProjectCheckCategory, ProjectScriptAnalysis } from "./model.js";

const managers = new Set(["pnpm", "npm", "yarn", "bun"]);

function scriptNameCategories(id: string): ProjectCheckCategory[] {
  if (/(?:^|[:_-])e2e(?:$|[:_-])|integration|playwright|cypress/iu.test(id)) {
    return ["e2e"];
  }
  if (
    /^(?:typecheck|type-check|types|ts:check|check:types|check:ts|check-types|type:check)$/u.test(
      id
    )
  ) {
    return ["types"];
  }
  if (/^(?:lint|lint:check|check:lint)$/u.test(id)) {
    return ["lint"];
  }
  if (/^(?:format:check|check:format|prettier:check)$/u.test(id)) {
    return ["format"];
  }
  if (
    /^(?:test|test:unit|unit|unit:test|test:coverage|coverage|test:watch)$/u.test(
      id
    )
  ) {
    return ["unit"];
  }
  if (/knip|fallow|dead[-_:]?code/iu.test(id)) {
    return ["dead-code"];
  }
  if (/^build(?:$|:)/u.test(id)) {
    return ["build"];
  }
  if (/(?:^check:|:check$|^verify:)/u.test(id)) {
    return ["custom"];
  }
  return [];
}

function localScriptReference(argv: string[], scripts: Record<string, string>) {
  const [first] = argv;
  if (!first || !managers.has(first)) {
    return null;
  }
  let offset = 1;
  while (argv[offset] === "--silent" || argv[offset] === "-s") {
    offset += 1;
  }
  if (argv[offset] === "run") {
    offset += 1;
  }
  const id = argv[offset];
  return id &&
    !id.startsWith("-") &&
    id !== "exec" &&
    scripts[id] &&
    argv.length === offset + 1
    ? id
    : null;
}

function invokesProjectRunner(argv: string[]) {
  return (
    (argv[0] === "project" && argv[1] === "check") ||
    argv.some((arg) => /project-cli\/cli\.[cm]?ts$/u.test(arg))
  );
}
function excludeSetupTestCategory(
  categories: Set<ProjectCheckCategory>,
  coverage: Set<ProjectCheckCategory>
) {
  if (categories.has("setup") && !coverage.has("e2e")) {
    categories.delete("e2e");
  }
  return [...categories];
}
/** Classify package scripts and prove bounded local alias coverage without executing project code. */
export function analyzeProjectScripts(scripts: Record<string, string>) {
  if (Object.keys(scripts).length > 512) {
    throw new Error(
      "PROJECT_CHECK_SCRIPTS: too many scripts; provide explicit configuration"
    );
  }
  const cache = new Map<string, ProjectScriptAnalysis>();
  const analyze = (id: string, stack: string[]): ProjectScriptAnalysis => {
    const cached = cache.get(id);
    if (cached) {
      return cached;
    }
    if (stack.includes(id) || stack.length >= 32) {
      return {
        automatic: false,
        categories: scriptNameCategories(id),
        coverage: [],
        id,
        recursive: true,
        references: [],
        uncertain: true,
      };
    }
    const body = scripts[id] ?? "";
    const commands = parseProjectCheckCommands(body);
    const names = scriptNameCategories(id);
    const categories = new Set<ProjectCheckCategory>(names);
    const coverage = new Set<ProjectCheckCategory>();
    const references = new Set<string>();
    let recursive = false;
    let uncertain = commands === null;
    let automatic = !/(?:^|:)(?:fix|watch|ui|dev|serve)(?:$|:)/u.test(id);
    for (const command of commands ?? []) {
      const argv = unwrapProjectCommand(command);
      const [executable, ...args] = argv;
      recursive ||= invokesProjectRunner(argv);
      automatic &&= !isNonAutomaticCheckCommand(executable, args);
      const reference = localScriptReference(argv, scripts);
      if (reference) {
        const child = analyze(reference, [...stack, id]);
        references.add(reference);
        for (const nested of child.references) {
          references.add(nested);
        }
        for (const category of child.coverage) {
          coverage.add(category);
        }
        for (const category of child.categories) {
          categories.add(category);
        }
        recursive ||= child.recursive;
        uncertain ||= child.uncertain;
        automatic &&= child.automatic;
      } else {
        const found = classifyProjectCommand(argv);
        if (found.includes("setup")) {
          automatic = false;
        }
        for (const category of found) {
          categories.add(category);
          coverage.add(category);
        }
        if (!found.length) {
          uncertain = true;
        }
      }
    }
    const resolvedCategories = excludeSetupTestCategory(categories, coverage);
    // A named check can be selected, but opaque code does not establish aggregate coverage.
    const result = {
      automatic: automatic && !recursive,
      categories: resolvedCategories,
      coverage: [...coverage],
      id,
      recursive,
      references: [...references],
      uncertain,
    };
    cache.set(id, result);
    return result;
  };
  return Object.keys(scripts)
    .filter(
      (id) =>
        scripts[id]?.trim() &&
        !/^(?:pre|post)(?:test|check|verify|lint|build)$/u.test(id)
    )
    .map((id) => analyze(id, []));
}
