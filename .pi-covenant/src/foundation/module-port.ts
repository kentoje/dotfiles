import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { PiHarnessOptions } from "./invocation/lifecycle.js";
import { createProjectCheckTool } from "./registration/project-tool.js";
import { createWorktreeTool } from "./registration/worktree-tool.js";
/** Create only implemented tool surfaces; standard Pi retains every built-in tool and session control. */
export function createPiHarnessTools(options: PiHarnessOptions = {}) {
  return [
    createProjectCheckTool(options),
    createWorktreeTool(options),
  ] as const;
}
/** Register additive custom tools, without session hooks, runtime verification gates or automatic turns. */
export function registerPiHarness(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiHarnessOptions = {}
) {
  const [project, worktree] = createPiHarnessTools(options);
  pi.registerTool(project);
  pi.registerTool(worktree);
}
