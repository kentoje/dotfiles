import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerPiHarness } from "./module-port.js";
/** Standard Pi extension entrypoint; host configuration is explicit and never read from a project declaration. */
export default function piCovenantExtension(pi: ExtensionAPI) {
  const configPath = process.env.PI_COVENANT_CONFIG;
  registerPiHarness(pi, configPath ? { configPath } : {});
}
