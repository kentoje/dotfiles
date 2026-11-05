import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { listContractFiles } from "../architecture/model.js";
/** Fingerprint verification inputs across the entire command, excluding generated output. */
export async function snapshotDevelopmentInputs(root: string) {
  const hash = createHash("sha256");
  for (const file of await listContractFiles(root)) {
    hash.update(relative(root, file));
    // oxlint-disable-next-line no-await-in-loop -- Preserve deterministic path/content ordering.
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}
