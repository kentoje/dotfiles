/** Check categories describe discovered tools; they do not prove suite adequacy. */
export type ProjectCheckCategory =
  | "types"
  | "lint"
  | "format"
  | "unit"
  | "dead-code"
  | "e2e"
  | "build"
  | "custom"
  | "setup";

/** Selection distinguishes executed plans, proven aggregate references and unexecuted alternatives. */
export type ProjectCheckSelection =
  | { state: "selected" }
  | { state: "covered"; by: string }
  | { state: "available"; reason: string };

/** Static inventory entry with source provenance and an explicit execution-selection explanation. */
export interface DiscoveredProjectCheck {
  id: string;
  categories: ProjectCheckCategory[];
  command: string;
  args: string[];
  cwd: string;
  evidence: string[];
  selection: ProjectCheckSelection;
}

/** Internal script analysis credits only understood, failure-propagating shell sequences. */
export interface ProjectScriptAnalysis {
  id: string;
  categories: ProjectCheckCategory[];
  coverage: ProjectCheckCategory[];
  references: string[];
  automatic: boolean;
  recursive: boolean;
  uncertain: boolean;
}
