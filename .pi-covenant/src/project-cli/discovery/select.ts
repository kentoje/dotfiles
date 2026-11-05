import type {
  DiscoveredProjectCheck,
  ProjectCheckCategory,
  ProjectScriptAnalysis,
} from "./model.js";

const rankProjectScript = (script: ProjectScriptAnalysis) =>
  script.id === "test" ||
  script.id === "typecheck" ||
  script.id === "lint" ||
  script.id === "fallow"
    ? 0
    : 1;

const ordinary: ProjectCheckCategory[] = [
  "types",
  "lint",
  "format",
  "unit",
  "dead-code",
];

/** Select an aggregate plus uncovered ordinary categories; leave E2E/build visible for project choice. */
export function selectProjectScripts(
  project: string,
  manager: string,
  analyses: ProjectScriptAnalysis[],
  configuredScripts?: ReadonlySet<string>
) {
  const selected: ProjectScriptAnalysis[] = [];
  const covered = new Set<ProjectCheckCategory>();
  const add = (script: ProjectScriptAnalysis) => {
    selected.push(script);
    for (const kind of [...script.coverage, ...script.categories]) {
      covered.add(kind);
    }
  };
  const aggregate = ["check", "verify"]
    .map((id) => analyses.find((script) => script.id === id))
    .find((script) => script !== undefined);
  if (configuredScripts === undefined && aggregate?.recursive) {
    throw new Error(
      "PROJECT_CHECK_RECURSION: aggregate contains a recursive script chain or invokes this runner"
    );
  }
  if (configuredScripts !== undefined) {
    for (const script of analyses) {
      if (configuredScripts.has(script.id)) {
        add(script);
      }
    }
  } else if (aggregate?.automatic) {
    add(aggregate);
  }
  for (const category of configuredScripts === undefined ? ordinary : []) {
    if (covered.has(category)) {
      continue;
    }
    const candidates = analyses.filter(
      (script) =>
        script.automatic &&
        script.categories.includes(category) &&
        !script.categories.some((kind) => kind === "e2e" || kind === "build")
    );
    const [preferred] = candidates.toSorted(
      (a, b) =>
        rankProjectScript(a) - rankProjectScript(b) || a.id.localeCompare(b.id)
    );
    if (preferred && !selected.includes(preferred)) {
      add(preferred);
    }
  }
  const discovered: DiscoveredProjectCheck[] = analyses
    .filter(
      (script) =>
        script.categories.length || ["check", "verify"].includes(script.id)
    )
    .map((script) => {
      const by = selected.find((check) => check.references.includes(script.id));
      let selection: DiscoveredProjectCheck["selection"] = {
        reason:
          "Alternative or custom command; select it explicitly to require this exact invocation.",
        state: "available",
      };
      if (selected.includes(script)) {
        selection = { state: "selected" };
      } else if (by && configuredScripts === undefined) {
        selection = { by: by.id, state: "covered" };
      } else if (configuredScripts !== undefined) {
        selection = {
          reason: "Not selected by the explicit project configuration.",
          state: "available",
        };
      } else if (script.categories.includes("setup")) {
        selection = {
          reason: "Setup/helper command; not an executable verification check.",
          state: "available",
        };
      } else if (!script.automatic) {
        selection = {
          reason: script.recursive
            ? "Recursive script chain; not selected."
            : "Mutating, interactive or watch command; not selected automatically.",
          state: "available",
        };
      } else if (
        script.categories.some(
          (category) => category === "e2e" || category === "build"
        )
      ) {
        selection = {
          reason:
            "E2E/build requires project-specific selection or inclusion in an existing selected aggregate.",
          state: "available",
        };
      }
      return {
        args: ["run", script.id],
        categories: script.categories,
        command: manager,
        cwd: project,
        evidence: [`package.json:scripts.${script.id}`],
        id: script.id,
        selection,
      };
    });
  const notes = discovered
    .filter((check) => check.selection.state === "available")
    .map(
      (check) =>
        `${check.id}: ${check.selection.state === "available" ? check.selection.reason : ""}`
    );
  if (aggregate?.uncertain) {
    notes.push(
      `${aggregate.id}: opaque shell/program behavior is not proof of aggregate coverage; additional ordinary checks are selected conservatively.`
    );
  }
  return { discovered, ids: selected.map((script) => script.id), notes };
}
