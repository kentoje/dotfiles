import { parse } from "shell-quote";

import type { MrCreationInput } from "../creation/check.js";

type MrDirectCommand =
  | { kind: "ignore" | "blocked" }
  | { kind: "checked"; input: MrCreationInput };
const literalCreation =
  /(?:^|[;&|\n])\s*(?:(?:command|env) +)?glab[ \t]+mr[ \t]+(?:create|new)(?=[\s;&|]|$)/u;
const aliases = new Map([
  ["-R", "repository"],
  ["--repo", "repository"],
  ["-s", "source_branch"],
  ["--source-branch", "source_branch"],
  ["-b", "target_branch"],
  ["--target-branch", "target_branch"],
  ["-t", "title"],
  ["--title", "title"],
  ["-d", "description"],
  ["--description", "description"],
]);
const switches = new Set([
  "--draft",
  "--wip",
  "--yes",
  "-y",
  "--no-editor",
  "--push=false",
]);
const repositoryPattern =
  /^https:\/\/[a-z0-9][a-z0-9.-]*(?::\d+)?\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u;
function isDirectMrCreate(values: readonly unknown[]) {
  return (
    values[0] === "glab" &&
    values[1] === "mr" &&
    (values[2] === "create" || values[2] === "new")
  );
}
function readMrCreationFlags(
  args: readonly string[],
  cwd: string | undefined
): MrDirectCommand {
  const entries = new Map<string, string>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (!switches.has(arg)) {
      const equals = arg.indexOf("=");
      const flag = equals === -1 ? arg : arg.slice(0, equals);
      const value = equals === -1 ? args[i + 1] : arg.slice(equals + 1);
      const name = aliases.get(flag);
      if (
        !name ||
        value === undefined ||
        value.startsWith("-") ||
        entries.has(name)
      ) {
        return { kind: "blocked" };
      }
      entries.set(name, value);
      if (equals === -1) {
        i += 1;
      }
    }
  }
  const repository = entries.get("repository");
  const source_branch = entries.get("source_branch");
  const target_branch = entries.get("target_branch");
  const title = entries.get("title");
  if (
    !repository ||
    !repositoryPattern.test(repository) ||
    !source_branch ||
    !target_branch ||
    !title
  ) {
    return { kind: "blocked" };
  }
  return {
    input: {
      ...(cwd ? { cwd } : {}),
      repository,
      source_branch,
      target_branch,
      title,
    },
    kind: "checked",
  };
}

/** Parse one bounded literal creation command and an optional literal cwd prefix. */
export function parseDirectMrCreation(command: string): MrDirectCommand {
  const recognized = literalCreation.test(command);
  let dynamic = false;
  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(command, () => {
      dynamic = true;
      return "";
    });
  } catch {
    return { kind: recognized ? "blocked" : "ignore" };
  }
  const [leader, workdir, operator] = tokens;
  const leadingCd =
    leader === "cd" &&
    typeof workdir === "string" &&
    typeof operator === "object" &&
    "op" in operator &&
    operator.op === "&&";
  const args = tokens.slice(leadingCd ? 3 : 0);
  if (!isDirectMrCreate(args)) {
    return { kind: recognized ? "blocked" : "ignore" };
  }
  if (
    dynamic ||
    command.length > 65_536 ||
    /[\r\n`]/u.test(command) ||
    command.includes("$(") ||
    (leadingCd && (!workdir || /^[~+-]/u.test(workdir))) ||
    !args.every((token) => typeof token === "string")
  ) {
    return { kind: "blocked" };
  }
  return readMrCreationFlags(args.slice(3), leadingCd ? workdir : undefined);
}
