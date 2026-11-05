import { createHash } from "node:crypto";
import { join } from "node:path";

import YAML from "yaml";

import { isReadOnlyCompilerCheck } from "../configuration/compiler-options.js";
import { decodeProjectCheckPlan } from "../configuration/plan.js";
import type {
  ProjectCheckPlan,
  ProjectCheckSpec,
} from "../configuration/plan.js";
import {
  classifyProjectCommand,
  isNonAutomaticCheckCommand,
  parseProjectCheckCommands,
  unwrapProjectCommand,
} from "./commands.js";
import type { DiscoveredProjectCheck, ProjectCheckCategory } from "./model.js";
import type { ProjectDiscoverySource } from "./sources.js";

interface SourceCommand {
  body: string;
  line: number;
  source: ProjectDiscoverySource;
}
interface StandaloneCheck {
  check: DiscoveredProjectCheck;
  automatic: boolean;
}
const ordinary = new Set<ProjectCheckCategory>([
  "types",
  "lint",
  "format",
  "unit",
  "dead-code",
]);

function ciCommands(source: ProjectDiscoverySource): SourceCommand[] {
  const lineCounter = new YAML.LineCounter();
  const document = YAML.parseDocument(source.text, { lineCounter });
  if (document.errors.length) {
    return [];
  }
  const result: SourceCommand[] = [];
  YAML.visit(document, {
    Pair(_key, pair) {
      if (
        !YAML.isScalar(pair.key) ||
        !["script", "run"].includes(String(pair.key.value)) ||
        !YAML.isNode(pair.value)
      ) {
        return;
      }
      YAML.visit(pair.value, {
        Scalar(_entry, scalar) {
          if (typeof scalar.value !== "string") {
            return;
          }
          const base =
            lineCounter.linePos(scalar.range?.[0] ?? 0).line +
            (scalar.type?.startsWith("BLOCK_") ? 1 : 0);
          for (const [offset, body] of scalar.value.split("\n").entries()) {
            result.push({ body, line: base + offset, source });
          }
        },
      });
    },
  });
  return result;
}
function instructionCommands(source: ProjectDiscoverySource): SourceCommand[] {
  const result: SourceCommand[] = [];
  let fenced = false;
  for (const [offset, line] of source.text
    .split("\n")
    .slice(0, 4096)
    .entries()) {
    if (/^\s*```/u.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      result.push({ body: line, line: offset + 1, source });
    } else {
      for (const match of line.matchAll(/`(?<command>[^`]+)`/gu)) {
        if (match.groups?.command) {
          result.push({
            body: match.groups?.command ?? "",
            line: offset + 1,
            source,
          });
        }
      }
    }
  }
  return result;
}
function sourceCommandWords(body: string) {
  const pieces = parseProjectCheckCommands(body.trim());
  if (pieces?.length !== 1) {
    return null;
  }
  let [argv] = pieces;
  if (!argv?.length) {
    return null;
  }
  if (["bash", "sh"].includes(argv[0] ?? "")) {
    if (argv.length !== 3 || !["-c", "-ac", "-lc"].includes(argv[1] ?? "")) {
      return null;
    }
    const inner = parseProjectCheckCommands(argv[2] ?? "");
    if (inner?.length !== 1) {
      return null;
    }
    [argv] = inner;
  }
  return argv;
}
function literalInvocation(body: string) {
  const argv = sourceCommandWords(body);
  if (!argv?.length || /^[A-Za-z_][A-Za-z0-9_]*=/u.test(argv[0] ?? "")) {
    return null;
  }
  if (
    ["pnpm", "npm", "yarn", "bun"].includes(argv[0] ?? "") &&
    argv[1] !== "exec"
  ) {
    return null;
  }
  const tool = unwrapProjectCommand(argv);
  const [name, ...args] = tool;
  if (
    !name ||
    (!["pnpm", "npm", "yarn", "bun"].includes(argv[0] ?? "") &&
      argv[0] !== name) ||
    name.includes("/") ||
    args.some(
      (arg) => arg.startsWith("/") || /(?:^|[=/])\.\.(?:\/|$)/u.test(arg)
    )
  ) {
    return null;
  }
  return { args, argv, name, tool };
}
async function standaloneCandidate(
  project: string,
  entry: SourceCommand
): Promise<StandaloneCheck | null> {
  const parsed = literalInvocation(entry.body);
  if (!parsed) {
    return null;
  }
  const categories = classifyProjectCommand(parsed.tool);
  if (
    !categories.length ||
    isNonAutomaticCheckCommand(parsed.name, parsed.args)
  ) {
    return null;
  }
  const command = ["pnpm", "npm", "yarn", "bun"].includes(parsed.argv[0] ?? "")
    ? parsed.argv[0]
    : join(project, "node_modules/.bin", parsed.name);
  if (!command) {
    return null;
  }
  const args = command === parsed.argv[0] ? parsed.argv.slice(1) : parsed.args;
  const signature = JSON.stringify([command, args, project]);
  const id = `source:${categories[0]}:${createHash("sha256").update(signature).digest("hex").slice(0, 12)}`;
  let automatic =
    entry.source.kind !== "documentation" &&
    !categories.some((category) =>
      ["e2e", "build", "setup"].includes(category)
    );
  if (categories.includes("types")) {
    automatic &&= await isReadOnlyCompilerCheck(project, parsed.args);
  }
  return {
    automatic,
    check: {
      args,
      categories,
      command,
      cwd: project,
      evidence: [`${entry.source.file}:${entry.line}`],
      id,
      selection: {
        reason: automatic
          ? "A supported standalone local check is available."
          : "Needs explicit selection or prerequisite context; compiler emission, browser/build/setup and documentation examples are not inferred effects.",
        state: "available",
      },
    },
  };
}

/** Add literal source commands as candidates and fill uncovered ordinary categories without running shell wrappers. */
export async function addStandaloneProjectChecks(
  project: string,
  plan: ProjectCheckPlan,
  sources: ProjectDiscoverySource[],
  explicit: boolean
): Promise<ProjectCheckPlan> {
  const entries = sources
    .flatMap((source) => {
      if (source.kind === "ci") {
        return ciCommands(source);
      }
      if (["instructions", "documentation"].includes(source.kind)) {
        return instructionCommands(source);
      }
      return [];
    })
    .slice(0, 512);
  const raw = await Promise.all(
    entries.map((entry) => standaloneCandidate(project, entry))
  );
  const unique = new Map<string, StandaloneCheck>();
  for (const candidate of raw) {
    if (!candidate) {
      continue;
    }
    const previous = unique.get(candidate.check.id);
    if (previous) {
      previous.check.evidence = [
        ...new Set([...previous.check.evidence, ...candidate.check.evidence]),
      ].toSorted();
      previous.automatic ||= candidate.automatic;
    } else {
      unique.set(candidate.check.id, candidate);
    }
  }
  const discovered = [...plan.discovered];
  const checks = [...plan.checks];
  const covered = new Set(
    discovered
      .filter((check) => check.selection.state === "selected")
      .flatMap((check) => check.categories)
  );
  for (const { check, automatic } of unique.values()) {
    const exact = checks.find(
      (item) =>
        item.command === check.command &&
        JSON.stringify(item.args) === JSON.stringify(check.args)
    );
    if (exact) {
      check.selection = { by: exact.id, state: "covered" };
    } else if (
      !explicit &&
      automatic &&
      check.categories.some(
        (category) => ordinary.has(category) && !covered.has(category)
      )
    ) {
      check.selection = { state: "selected" };
      const spec: ProjectCheckSpec = {
        args: check.args,
        command: check.command,
        cwd: project,
        id: check.id,
        timeout_ms: check.categories.includes("unit") ? 180_000 : 60_000,
      };
      checks.push(spec);
      for (const category of check.categories) {
        covered.add(category);
      }
    } else if (explicit) {
      check.selection = {
        reason: "Not selected by the explicit project configuration.",
        state: "available",
      };
    }
    discovered.push(check);
  }
  const validated =
    !explicit && checks.length
      ? await decodeProjectCheckPlan(project, plan.source, { checks })
      : { ...plan, checks };
  return {
    ...validated,
    discovered,
    notes: [
      ...plan.notes,
      ...discovered
        .filter(
          (check) =>
            check.id.startsWith("source:") &&
            check.selection.state === "available"
        )
        .map(
          (check) =>
            `${check.id}: standalone command is available but not selected.`
        ),
    ],
  };
}
