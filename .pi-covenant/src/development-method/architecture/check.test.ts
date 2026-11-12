import { fileURLToPath } from "node:url";

import { contractTest } from "@covenant/vitest";
import { describe, expect } from "vitest";

import { checkModuleContracts } from "./check.js";
import { rejectContractMutations } from "./violations.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
describe("development contract verification", () => {
  contractTest("development.contract-consistency", async () => {
    const result = await checkModuleContracts(root);
    expect(result.modules).toBe(16);
    expect(result.schemaFixtureChecks).toBe(192);
    await expect(rejectContractMutations(root)).resolves.toBe(7);
  });
});
