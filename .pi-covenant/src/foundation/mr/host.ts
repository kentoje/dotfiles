import { makeGitlabModule } from "../../gitlab/module-port.js";
import type { MrHost } from "../../mr/module-port.js";
import { createConfiguredGitlabTransport } from "../gitlab/configured.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { loadMrDeliveryPolicy } from "./policy.js";

export function createPiMrHost(options: PiHarnessOptions, cwd: string): MrHost {
  if (!options.gitlab) {
    throw new Error("MR_CONFIG: set the GitLab host and credential file.");
  }
  const transport = createConfiguredGitlabTransport(options.gitlab);
  return {
    gitlab: makeGitlabModule({
      ...transport,
      selection: { allowedHosts: [options.gitlab.host] },
      sessionCwd: cwd,
    }),
    request: transport.requestMr,
    titlePrefix: async (repository) => {
      const policy = await loadMrDeliveryPolicy(
        options.mrPolicyFile,
        repository
      );
      return policy?.titlePrefix;
    },
  };
}
