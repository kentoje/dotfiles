/** Public project check discovery; project code is read statically without side effects. */
export { inspectProjectChecks } from "./discovery/inspect.js";
/** Public mandatory check execution; the caller supplies cancellation and deadline separately. */
export { runProjectChecks } from "./completion/check.js";
/** Types for the mandatory check plan and its complete result. */
export type {
  ProjectCheckPlan,
  ProjectCheckSpec,
} from "./configuration/plan.js";
export type { ProjectCheckReport } from "./completion/check.js";
export type {
  ProjectCheckInvocation,
  ProjectCheckResult,
} from "./execution/process.js";
/** Static project profile proposals and explicit reviewed publication. */
export {
  applyProjectProfile,
  proposeProjectProfile,
} from "./authoring/profile.js";
/** Execute one explicitly selected project capability with inherited host limits. */
export { runProjectCapability } from "./capability/run.js";
