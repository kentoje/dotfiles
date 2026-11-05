import { fileURLToPath } from "node:url";

import { contractTest } from "@covenant/vitest";
import { describe, expect } from "vitest";

import { createFallowBoundaries, verifyFallowBoundaryProbe } from "./fallow.js";
import { loadModuleContracts } from "./model.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
describe("Fallow module boundaries", () => {
  contractTest("development.fallow-boundaries", async () => {
    const boundaries = createFallowBoundaries(await loadModuleContracts(root));
    expect(
      boundaries.rules.find((rule) => rule.from === "worktree")?.allow
    ).toStrictEqual(["tool-protocol", "repository-context"]);
    await expect(verifyFallowBoundaryProbe(root)).resolves.toBeTruthy();
  });
});
