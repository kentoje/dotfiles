import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { createGlabCredentialProvider } from "./credential.js";
import { createGitlabReadTransport } from "./transport.js";

export function createConfiguredGitlabTransport(
  config: NonNullable<PiHarnessOptions["gitlab"]>
) {
  return createGitlabReadTransport({
    hosts: [
      {
        apiOrigin: config.apiOrigin,
        credential: createGlabCredentialProvider({
          configPath: config.credentialFile,
          host: config.host,
        }),
        host: config.host,
      },
    ],
  });
}
