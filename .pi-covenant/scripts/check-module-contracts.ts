import { fileURLToPath } from "node:url";

import { checkModuleContracts } from "../src/development-method/module-port.js";

const root = fileURLToPath(new URL("../", import.meta.url));
console.log(JSON.stringify(await checkModuleContracts(root)));
