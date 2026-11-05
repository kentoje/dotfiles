import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import { createFallowBoundaries } from "./fallow.js";
import { checkModuleImports } from "./imports.js";
import {
  decodeContractFixtures,
  decodeNativeContract,
  decodePublicDefinition,
  listContractFiles,
  loadModuleContracts,
  readContractData,
} from "./model.js";
import type { ModuleContract, ModuleContracts } from "./model.js";

function requireContract(
  condition: unknown,
  message: string
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
function checkDependencyGraph(modules: ModuleContracts) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string) => {
    requireContract(!visiting.has(name), `DEPENDENCY_CYCLE: ${name}`);
    if (visited.has(name)) {
      return;
    }
    const module = modules.get(name);
    requireContract(module, `UNKNOWN_DEPENDENCY: ${name}`);
    visiting.add(name);
    for (const dependency of module.dependencies) {
      visit(dependency);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of modules.keys()) {
    visit(name);
  }
}
async function checkModuleOwnership(
  root: string,
  name: string,
  module: ModuleContract
) {
  const contract = decodeNativeContract(
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    await readContractData(join(root, `contracts/${name}/contract.yaml`))
  );
  requireContract(
    module.owner === name && module.interface_id === `${name}-v1`,
    "INTERFACE_IDENTITY: mismatched owner"
  );
  requireContract(
    module.implementation_root === `src/${name}/` &&
      module.test_root === module.implementation_root &&
      module.test_pattern === "**/*.test.ts",
    "MODULE_OWNERSHIP: source and colocated tests need an exclusive owner"
  );
  requireContract(
    isDeepStrictEqual(contract.dependencies, module.dependencies),
    "DEPENDENCY_DRIFT: native metadata differs"
  );
  const expected = [
    {
      export: `${name}-v1`,
      language: "typescript",
      module: `architecture/modules/${name}.json`,
      name: `${name}-v1`,
    },
  ];
  if (module.implementation_binding) {
    expected.push(module.implementation_binding);
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    await access(join(root, module.implementation_binding.module));
    requireContract(
      module.implementation_binding.module ===
        `${module.implementation_root}module-port.ts`,
      "IMPLEMENTATION_OWNERSHIP: public entrypoint must belong to its owner"
    );
  }
  requireContract(
    isDeepStrictEqual(contract.interfaces, expected),
    "INTERFACE_DRIFT: native interface differs"
  );
}
function checkConsumedPorts(module: ModuleContract, modules: ModuleContracts) {
  requireContract(
    isDeepStrictEqual(
      Object.keys(module.consumes).toSorted(),
      [...module.dependencies].toSorted()
    ),
    "PORT_COVERAGE: exact dependency allowlists required"
  );
  for (const [provider, operations] of Object.entries(module.consumes)) {
    requireContract(
      new Set(operations).size === operations.length,
      "DUPLICATE_PORT: repeated operation"
    );
    const target = modules.get(provider);
    requireContract(
      target && operations.every((operation) => operation in target.operations),
      `UNKNOWN_PORT: ${provider}`
    );
  }
}
async function checkPublicSchemas(root: string, modules: ModuleContracts) {
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  const batches = await Promise.all(
    ["tools", "commands", "capabilities", "contracts"].map((directory) =>
      listContractFiles(join(root, directory))
    )
  );
  const files = batches.flat();
  for (const file of files.filter((path) =>
    path.endsWith("/definition.json")
  )) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    const definition = decodePublicDefinition(await readContractData(file));
    const module = modules.get(definition.component);
    if (!module || definition.component === "jira-preflight") {
      continue;
    }
    for (const action of definition.actions) {
      const port = module.operations[action.name];
      requireContract(
        port,
        `PUBLIC_PORT_MISSING: ${definition.component}.${action.name}`
      );
      for (const field of [
        "input_schema",
        "output_schema",
        "effect",
        "rules",
      ] satisfies (keyof typeof port)[]) {
        requireContract(
          isDeepStrictEqual(action[field], port[field]),
          `PUBLIC_PORT_DRIFT: ${definition.component}.${action.name}: ${field}`
        );
      }
    }
  }
}
async function checkPortFixtures(
  root: string,
  name: string,
  module: ModuleContract
) {
  const ajv = new Ajv2020({ strict: false });
  let checks = 0;
  for (const [operation, port] of Object.entries(module.operations)) {
    const fixtures = decodeContractFixtures(
      // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
      await readContractData(
        join(root, `architecture/fixtures/${name}--${operation}.json`)
      )
    );
    for (const direction of ["input_schema", "output_schema"] satisfies (
      | "input_schema"
      | "output_schema"
    )[]) {
      requireContract(
        ajv.validateSchema(port[direction]),
        `SCHEMA_INVALID: ${name}.${operation}`
      );
      const cases = fixtures.filter(
        (fixture) => fixture.direction === direction
      );
      requireContract(
        cases.some((fixture) => fixture.valid) &&
          cases.some((fixture) => !fixture.valid),
        `FIXTURE_COVERAGE: ${name}.${operation}: positive and negative ${direction} cases required`
      );
      const validate = ajv.compile(port[direction]);
      for (const fixture of cases) {
        requireContract(
          validate(fixture.payload) === fixture.valid,
          `FIXTURE_MISMATCH: ${name}.${operation}: ${direction}`
        );
        checks += 1;
      }
    }
  }
  return checks;
}
/** Validate all declared owners, dependencies, schemas, fixtures and TypeScript import boundaries. */
export async function checkModuleContracts(root: string) {
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  const modules = await loadModuleContracts(root);
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  const entries = await readdir(join(root, "contracts"), {
    withFileTypes: true,
  });
  const contracts = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  requireContract(
    isDeepStrictEqual([...modules.keys()].toSorted(), contracts),
    "MODULE_COVERAGE: every component needs an interface"
  );
  checkDependencyGraph(modules);
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  await checkPublicSchemas(root, modules);
  let operations = 0;
  let schemaFixtureChecks = 0;
  for (const [name, module] of modules) {
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    await checkModuleOwnership(root, name, module);
    checkConsumedPorts(module, modules);
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    schemaFixtureChecks += await checkPortFixtures(root, name, module);
    operations += Object.keys(module.operations).length;
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    const files = await listContractFiles(
      join(root, module.implementation_root)
    ).catch((error) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    });
    // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
    await checkModuleImports(
      root,
      name,
      module,
      files.filter((file) => /\.[cm]?[jt]sx?$/u.test(file))
    );
  }
  // oxlint-disable-next-line no-await-in-loop -- Sequential validation preserves deterministic diagnostics and stops dependent checks on failure.
  const fallow = await readContractData(join(root, ".fallowrc.json"));
  requireContract(
    fallow &&
      typeof fallow === "object" &&
      "boundaries" in fallow &&
      isDeepStrictEqual(fallow.boundaries, createFallowBoundaries(modules)),
    "FALLOW_BOUNDARY_DRIFT: configuration must follow declared module dependencies"
  );
  return {
    implementedModules: [...modules]
      .filter(([, module]) => module.implementation_binding)
      .map(([name]) => name),
    modules: modules.size,
    operations,
    schemaFixtureChecks,
  };
}
