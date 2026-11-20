import { contractTest } from "@covenant/vitest";
import { Type } from "typebox";
import { expect } from "vitest";

import { validateToolBoundary } from "../module-port.js";

contractTest("tool-protocol.strict-boundary", () => {
  const schema = Type.Object(
    { count: Type.Integer() },
    { additionalProperties: false }
  );
  expect(validateToolBoundary(schema, { count: 1 })).toBeTruthy();
  expect(validateToolBoundary(schema, { count: "1" })).toBeFalsy();
  expect(
    validateToolBoundary(schema, { approval: true, count: 1 })
  ).toBeFalsy();
});
