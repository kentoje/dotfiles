import { access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { probeWorktreeContracts } from "../src/development-method/module-port.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = join(root, ".covenant/bin/covenant");
const binary =
  process.env.COVENANT_BIN ??
  (await access(local).then(
    () => local,
    () => "covenant"
  ));
console.log(JSON.stringify(await probeWorktreeContracts(root, binary)));
