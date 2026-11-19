import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import type { PiHarnessOptions } from "./invocation/lifecycle.js";
import { createGitlabTool } from "./registration/gitlab-tool.js";
import { createProjectCheckTool } from "./registration/project-tool.js";
import { createWorktreeTool } from "./registration/worktree-tool.js";
/** Create only implemented tool surfaces; standard Pi retains every built-in tool and session control. */
export function createPiHarnessTools(options: PiHarnessOptions = {}) {
  return [
    createProjectCheckTool(options),
    createWorktreeTool(options),
    createGitlabTool(options),
  ] as const;
}
/** Register additive custom tools, without session hooks, runtime verification gates or automatic turns. */
export function registerPiHarness(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiHarnessOptions = {}
) {
  const [project, worktree, gitlab] = createPiHarnessTools(options);
  pi.registerTool(project);
  pi.registerTool(worktree);
  pi.registerTool(gitlab);
}

/** Host-only authenticated GitLab transport for fixed project and CI endpoints. */
export { createGitlabReadTransport } from "./gitlab/transport.js";
/** The explicit host credential file bridge does not inspect project-local configuration. */
export { createGlabCredentialProvider } from "./gitlab/credential.js";
