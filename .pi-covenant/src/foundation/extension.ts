import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPiHarness } from "./module-port.js";
/** Standard Pi extension entrypoint; host configuration is explicit and never read from a project declaration. */
export default function piCovenantExtension(pi: ExtensionAPI) {
  const configPath = process.env.PI_COVENANT_CONFIG;
  const host = process.env.PI_COVENANT_GITLAB_HOST;
  const credentialFile = process.env.PI_COVENANT_GITLAB_CREDENTIAL_FILE;
  registerPiHarness(pi, {
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
