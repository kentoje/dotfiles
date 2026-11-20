import { lstat, readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";

import { Type } from "typebox";
import { Value } from "typebox/value";

const relative = Type.String({ maxLength: 1024, minLength: 1 });
const inventory = Type.Object(
  {
    repositories: Type.Array(
      Type.Object(
        {
          comparisonRef: Type.Optional(
            Type.String({
              pattern: "^refs/(?:heads|remotes|tags)/[a-zA-Z0-9._/-]+$",
            })
          ),
          id: Type.String({ pattern: "^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$" }),
          manifests: Type.Optional(
            Type.Array(relative, { maxItems: 200, minItems: 1 })
          ),
          path: Type.String({ maxLength: 4096, minLength: 1 }),
        },
        { additionalProperties: false }
      ),
      { maxItems: 100 }
    ),
  },
  { additionalProperties: false }
);

export async function loadFleetInventory(file: string | undefined) {
  if (!file || !isAbsolute(file)) {
    throw new Error(
      "FLEET_CONFIG: set PI_COVENANT_FLEET_FILE to an absolute inventory file."
    );
  }
  const info = await lstat(file);
  if (!info.isFile() || info.size > 65_536) {
    throw new Error("FLEET_CONFIG: use a regular JSON file of at most 64 KiB.");
  }
  const raw: unknown = JSON.parse(await readFile(file, "utf-8"));
  if (
    !Value.Check(inventory, raw) ||
    raw.repositories.some((repo) => !isAbsolute(repo.path)) ||
    new Set(raw.repositories.map(({ id }) => id)).size !==
      raw.repositories.length
  ) {
    throw new Error(
      "FLEET_CONFIG: invalid checkout paths, comparison refs or duplicate IDs."
    );
  }
  return raw.repositories;
}
