/** Public development-only entrypoint; never registered as a product-session gate. */
export { checkModuleContracts } from "./architecture/check.js";
export { runDevelopmentCommand } from "./verification/command.js";
export { assessDevelopmentResults } from "./verification/policy.js";
export type {
  DevelopmentCommand,
  DevelopmentCommandResult,
} from "./verification/command.js";
export { probeWorktreeContracts } from "./verification/probes.js";

export { snapshotDevelopmentInputs } from "./verification/inputs.js";
