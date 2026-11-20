import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { PiHarnessOptions } from "./invocation/lifecycle.js";
import { registerMrGuardHook } from "./mr/guard-hook.js";
import { createGitlabTool } from "./registration/gitlab-tool.js";
import { createJiraTool } from "./registration/jira-tool.js";
import { createMrTool } from "./registration/mr-tool.js";
import { createProjectCheckTool } from "./registration/project-tool.js";
import { registerPiShipCommand } from "./registration/ship-command.js";
import { createWorktreeTool } from "./registration/worktree-tool.js";
/** Create only implemented tool surfaces; standard Pi retains every built-in tool and session control. */
export function createPiHarnessTools(options: PiHarnessOptions = {}) {
  return [
    createProjectCheckTool(options),
    createWorktreeTool(options),
    createGitlabTool(options),
    createJiraTool(options),
    createMrTool(options),
  ] as const;
}
/** Register additive custom tools, without session hooks, runtime verification gates or automatic turns. */
export function registerPiHarness(
  pi: Pick<ExtensionAPI, "registerTool"> &
    Partial<Pick<ExtensionAPI, "on" | "registerCommand">>,
  options: PiHarnessOptions = {}
) {
  const [project, worktree, gitlab, jira, mr] = createPiHarnessTools(options);
  pi.registerTool(project);
  pi.registerTool(worktree);
  pi.registerTool(gitlab);
  pi.registerTool(jira);
  pi.registerTool(mr);
  if (pi.registerCommand) {
    registerPiShipCommand(
      { registerCommand: pi.registerCommand.bind(pi) },
      options
    );
  }
  if (options.interceptMrCreation && pi.on) {
    registerMrGuardHook({ on: pi.on.bind(pi) }, options);
  }
}

/** Host-only authenticated GitLab transport for fixed project and CI endpoints. */
export { createGitlabReadTransport } from "./gitlab/transport.js";
/** The explicit host credential file bridge does not inspect project-local configuration. */
export { createGlabCredentialProvider } from "./gitlab/credential.js";
