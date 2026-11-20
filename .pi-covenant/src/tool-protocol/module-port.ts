import type { Static, TSchema } from "typebox";
import { Value } from "typebox/value";

/** Validate a tool boundary against its trusted action schema without coercion or payload logging. */
export function validateToolBoundary<T extends TSchema>(
  schema: T,
  payload: unknown
): payload is Static<T> {
  return Value.Check(schema, payload);
}
