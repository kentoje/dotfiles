import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { Schema } from "effect";
import YAML from "yaml";

const jsonObject = Schema.Record(Schema.String, Schema.Unknown);
const portSchema = Schema.Struct({
  effect: Schema.String,
  input_schema: jsonObject,
  output_schema: jsonObject,
  rules: Schema.Array(Schema.String),
});
const bindingSchema = Schema.Struct({
  export: Schema.String,
  language: Schema.String,
  module: Schema.String,
  name: Schema.String,
});
const moduleSchema = Schema.Struct({
  consumes: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  dependencies: Schema.Array(Schema.String),
  implementation_binding: Schema.optionalKey(bindingSchema),
  implementation_root: Schema.String,
  interface_id: Schema.String,
  operations: Schema.Record(Schema.String, portSchema),
  owner: Schema.String,
  test_pattern: Schema.String,
  test_root: Schema.String,
});
const contractSchema = Schema.Struct({
  dependencies: Schema.Array(Schema.String),
  interfaces: Schema.Array(bindingSchema),
});
const fixtureSchema = Schema.Array(
  Schema.Struct({
    direction: Schema.Literals(["input_schema", "output_schema"]),
    payload: Schema.Unknown,
    valid: Schema.Boolean,
  })
);
const definitionSchema = Schema.Struct({
  actions: Schema.Array(
    Schema.Struct({ name: Schema.String, ...portSchema.fields })
  ),
  component: Schema.String,
});

/** Read JSON/YAML as untrusted data before decoding its relevant contract fields. */
export async function readContractData(path: string): Promise<unknown> {
  const text = await readFile(path, "utf-8");
  const value: unknown = path.endsWith(".json")
    ? JSON.parse(text)
    : YAML.parse(text);
  return value;
}
/** Enumerate owned files while excluding generated evidence and dependency stores. */
export async function listContractFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          ![
            "node_modules",
            ".git",
            ".covenant",
            ".fallow",
            "dist",
            "__pycache__",
          ].includes(entry.name)
      )
      .map((entry) => {
        const path = join(root, entry.name);
        if (entry.isSymbolicLink()) {
          throw new Error(`CONTRACT_SYMLINK: ${path}`);
        }
        return entry.isDirectory() ? listContractFiles(path) : [path];
      })
  );
  return nested.flat().toSorted();
}
/** Load the explicit dependency graph and typed module interfaces. */
export async function loadModuleContracts(root: string) {
  const graph = Schema.decodeUnknownSync(
    Schema.Struct({ modules: Schema.Array(Schema.String) })
  )(await readContractData(join(root, "architecture/module-graph.json")));
  const modules = new Map(
    await Promise.all(
      graph.modules.map(
        async (name) =>
          [
            name,
            Schema.decodeUnknownSync(moduleSchema)(
              await readContractData(
                join(root, `architecture/modules/${name}.json`)
              )
            ),
          ] satisfies [string, typeof moduleSchema.Type]
      )
    )
  );
  return modules;
}
export type ModuleContracts = Awaited<ReturnType<typeof loadModuleContracts>>;
export type ModuleContract =
  ModuleContracts extends Map<string, infer Module> ? Module : never;
export const decodeNativeContract = Schema.decodeUnknownSync(contractSchema);
export const decodeContractFixtures = Schema.decodeUnknownSync(fixtureSchema);
export const decodePublicDefinition =
  Schema.decodeUnknownSync(definitionSchema);
