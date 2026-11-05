import { basename } from "node:path";

import { parse } from "shell-quote";

import type { ProjectCheckCategory } from "./model.js";

const managers = new Set(["pnpm", "npm", "yarn", "bun"]);

export function unwrapProjectCommand(words: string[]) {
  let argv = [...words];
  if (argv[0] === "env" || argv[0] === "cross-env") {
    argv = argv.slice(1);
  }
  while (argv[0] && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(argv[0])) {
    argv = argv.slice(1);
  }
  if (argv[0] === "npx") {
    argv = argv.slice(1).filter((word) => word !== "--no-install");
  }
  const [first] = argv;
  if (first && managers.has(first)) {
    let offset = 1;
    while (argv[offset] === "--silent" || argv[offset] === "-s") {
      offset += 1;
    }
    if (
      argv[offset] === "run" &&
      ["playwright", "cypress"].includes(argv[offset + 1] ?? "")
    ) {
      return argv.slice(offset + 1);
    }
    if (["playwright", "cypress"].includes(argv[offset] ?? "")) {
      return argv.slice(offset);
    }
    if (argv[offset] === "exec") {
      return argv.slice(offset + 1).filter((word) => word !== "--");
    }
  }
  return argv;
}

function isBrowserSetup(executable: string, args: string[]) {
  if (executable === "playwright") {
    return (
      !args.length ||
      ["install", "install-deps", "uninstall", "codegen"].includes(
        args[0] ?? ""
      )
    );
  }
  if (executable === "cypress") {
    return (
      !args.length ||
      ["install", "verify", "open", "cache"].includes(args[0] ?? "")
    );
  }
  return false;
}
/** Recognize check tools and distinguish browser setup from test execution. */
export function classifyProjectCommand(argv: string[]): ProjectCheckCategory[] {
  const [first, ...args] = argv;
  if (!first) {
    return [];
  }
  const executable = basename(first);
  if (isBrowserSetup(executable, args)) {
    return ["setup"];
  }
  if (executable === "ultracite" && args[0] === "check") {
    return ["lint", "format"];
  }
  if (["eslint", "oxlint", "stylelint", "biome"].includes(executable)) {
    return ["lint"];
  }
  if (["prettier", "oxfmt"].includes(executable) && args.includes("--check")) {
    return ["format"];
  }
  if (["tsc", "tsgo", "vue-tsc", "svelte-check"].includes(executable)) {
    return ["types"];
  }
  if (["jest", "vitest", "rstest", "ava", "mocha"].includes(executable)) {
    return ["unit"];
  }
  if (
    (executable === "playwright" && args[0] === "test") ||
    (executable === "cypress" && args[0] === "run")
  ) {
    return ["e2e"];
  }
  if (["fallow", "knip"].includes(executable)) {
    return ["dead-code"];
  }
  if (
    ["rsbuild", "vite", "webpack", "rollup", "next"].includes(executable) &&
    args.includes("build")
  ) {
    return ["build"];
  }
  return [];
}

/** Parse only straight-line conjunctions, never evaluate variables, substitutions or shell code. */
export function parseProjectCheckCommands(body: string): string[][] | null {
  try {
    const tokens = parse(body, () => ({ variable: true }));
    const commands: string[][] = [[]];
    for (const token of tokens) {
      if (typeof token === "string") {
        commands.at(-1)?.push(token);
      } else if ("op" in token && token.op === "&&") {
        commands.push([]);
      } else {
        return null;
      }
    }
    return commands.every((command) => command.length > 0) ? commands : null;
  } catch {
    return null;
  }
}

export function isNonAutomaticCheckCommand(
  executable: string | undefined,
  args: string[]
) {
  return (
    args.some((arg) =>
      ["--fix", "--write", "--watch", "--ui", "-w"].includes(arg)
    ) ||
    (executable === "ultracite" && args[0] === "fix")
  );
}
