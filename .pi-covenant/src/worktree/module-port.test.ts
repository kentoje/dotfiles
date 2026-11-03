import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "./testing/fixture.js";

describe("worktree port", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.result-schemas", async () => {
    const { Ajv2020 } = await import("ajv/dist/2020.js");
    const { readFile } = await import("node:fs/promises");
    const { Schema } = await import("effect");
    const definition = Schema.decodeUnknownSync(
      Schema.Struct({
        actions: Schema.Array(
          Schema.Struct({ name: Schema.String, output_schema: Schema.Unknown })
        ),
      })
    )(
      JSON.parse(
        await readFile(
          new URL("../../tools/worktree/definition.json", import.meta.url),
          "utf-8"
        )
      )
    );
    const ajv = new Ajv2020({ strict: false });
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "schema" }));
    if (!created.data) {
      throw new Error("Missing path");
    }
    const results = [
      ["new", created],
      ["new", await Effect.runPromise(f.module.new({ task: "../invalid" }))],
      [
        "verify",
        await Effect.runPromise(f.module.verify({ path: created.data.path })),
      ],
      ["list", await Effect.runPromise(f.module.list({}))],
      ["rm", await Effect.runPromise(f.module.rm({ path: created.data.path }))],
    ];
    for (const [action, result] of results) {
      const schema = definition.actions.find(
        (item) => item.name === action
      )?.output_schema;
      const validate = ajv.compile(
        Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
          schema
        )
      );
      expect(validate(result), JSON.stringify(validate.errors)).toBeTruthy();
    }
  });
});
