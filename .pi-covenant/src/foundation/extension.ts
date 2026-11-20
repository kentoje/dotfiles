import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPiHarness } from "./module-port.js";
/** Standard Pi extension entrypoint; host configuration is explicit and never read from a project declaration. */
export default function piCovenantExtension(pi: ExtensionAPI) {
  const configPath = process.env.PI_COVENANT_CONFIG;
  const host = process.env.PI_COVENANT_GITLAB_HOST;
  const credentialFile = process.env.PI_COVENANT_GITLAB_CREDENTIAL_FILE;
  const jiraSite = process.env.PI_COVENANT_JIRA_SITE;
  const jiraEmail = process.env.PI_COVENANT_JIRA_EMAIL;
  const jiraCredentialFile = process.env.PI_COVENANT_JIRA_CREDENTIAL_FILE;
  const mrPolicyFile = process.env.PI_COVENANT_MR_POLICY_FILE;
  registerPiHarness(pi, {
    interceptMrCreation: process.env.PI_COVENANT_INTERCEPT_MR_CREATION === "1",
    ...(mrPolicyFile ? { mrPolicyFile } : {}),
    ...(jiraSite && jiraEmail && jiraCredentialFile
      ? {
          jira: {
            credentialFile: jiraCredentialFile,
            email: jiraEmail,
            site: jiraSite,
          },
        }
      : {}),
    ...(configPath ? { configPath } : {}),
    ...(host && credentialFile
      ? {
          gitlab: {
            apiOrigin:
              process.env.PI_COVENANT_GITLAB_API_ORIGIN ?? `https://${host}`,
            credentialFile,
            host,
          },
        }
      : {}),
  });
}
