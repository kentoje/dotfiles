import { JiraFailureError } from "../invocation/run.js";
import { jiraObject, jiraString } from "../issues/read.js";

const reserved = new Set([
  "project",
  "issuetype",
  "status",
  "key",
  "id",
  "__proto__",
  "constructor",
  "prototype",
]);

export interface JiraField {
  id: string;
  name: string;
  metadata: Record<string, unknown>;
}

export function readJiraField(id: unknown, value: unknown): JiraField {
  const metadata = jiraObject(value);
  const key = jiraString(id);
  const name = jiraString(metadata?.name);
  if (!metadata || !key || !name) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira returned invalid field metadata."
    );
  }
  return { id: key, metadata, name };
}

export function readJiraFields(value: unknown) {
  const fields = jiraObject(value);
  if (!fields) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira did not return current field metadata."
    );
  }
  return Object.entries(fields).map(([key, item]) => readJiraField(key, item));
}

export function selectJiraOption<T extends { id: string; name: string }>(
  value: string,
  items: readonly T[]
) {
  const exact = items.filter((entry) => entry.id === value);
  return exact.length ? exact : items.filter((entry) => entry.name === value);
}

function validJiraChoice(value: unknown, allowed: readonly unknown[]) {
  return allowed.some((option) => {
    const fields = jiraObject(option);
    const input = jiraObject(value);
    if (fields && input) {
      const ref = ["id", "accountId", "key", "value", "name"].find((key) =>
        Object.hasOwn(input, key)
      );
      return ref !== undefined && fields[ref] === input[ref];
    }
    return !fields && Object.is(option, value);
  });
}

function validJiraType(value: unknown, type: unknown) {
  switch (type) {
    case "array": {
      return Array.isArray(value);
    }
    case "number": {
      return typeof value === "number" && Number.isFinite(value);
    }
    case "integer": {
      return Number.isSafeInteger(value);
    }
    case "boolean": {
      return typeof value === "boolean";
    }
    case "string":
    case "date":
    case "datetime": {
      return typeof value === "string";
    }
    case "user":
    case "group":
    case "option":
    case "version":
    case "priority":
    case "resolution":
    case "component":
    case "issue": {
      return jiraObject(value) !== undefined;
    }
    default: {
      return value !== undefined;
    }
  }
}

function matchesJiraFieldValue(
  field: JiraField,
  value: unknown,
  allowedValues: unknown
) {
  const schema = jiraObject(field.metadata.schema);
  const richText =
    field.id === "description" ||
    field.id === "environment" ||
    schema?.custom ===
      "com.atlassian.jira.plugin.system.customfieldtypes:textarea";
  const adf = jiraObject(value);
  const validType = richText
    ? adf?.type === "doc" && adf.version === 1 && Array.isArray(adf.content)
    : validJiraType(value, schema?.type);
  const values: readonly unknown[] = Array.isArray(value) ? value : [value];
  return (
    value !== null &&
    validType &&
    (!Array.isArray(value) ||
      value.every((item: unknown) => validJiraType(item, schema?.items))) &&
    (!Array.isArray(allowedValues) ||
      allowedValues.length === 0 ||
      values.every((item) => validJiraChoice(item, allowedValues)))
  );
}

function validateJiraField(
  field: JiraField | undefined,
  name: string,
  value: unknown,
  current: ReadonlyMap<string, unknown>,
  locked: ReadonlySet<string>
) {
  if (
    !field ||
    reserved.has(field.id) ||
    locked.has(field.id) ||
    current.has(field.id)
  ) {
    throw new JiraFailureError(
      "FIELD_UNSUPPORTED",
      `Field is unavailable, reserved, or already supplied: ${name}`
    );
  }
  const { operations, required, allowedValues } = field.metadata;
  if (Array.isArray(operations) && !operations.includes("set")) {
    throw new JiraFailureError(
      "FIELD_UNSUPPORTED",
      `The field does not permit setting its value: ${field.id}`
    );
  }
  if (value === null && !required) {
    return;
  }
  if (!matchesJiraFieldValue(field, value, allowedValues)) {
    throw new JiraFailureError(
      "FIELD_UNSUPPORTED",
      `Value does not match current Jira field metadata: ${field.id}`
    );
  }
}

export function resolveJiraFields(
  input: Record<string, unknown>,
  fields: readonly JiraField[],
  locked: ReadonlySet<string>,
  checkRequired: boolean
) {
  const selected = new Map<string, unknown>();
  for (const [name, value] of Object.entries(input)) {
    const matches = selectJiraOption(name, fields);
    if (matches.length > 1) {
      throw new JiraFailureError(
        "FIELD_AMBIGUOUS",
        `Use an exact Jira field ID for: ${name}`,
        "error",
        { ids: matches.map(({ id }) => id) }
      );
    }
    const [field] = matches;
    validateJiraField(field, name, value, selected, locked);
    if (field) {
      selected.set(field.id, value);
    }
  }
  if (checkRequired) {
    const missing = fields.filter(
      ({ id, metadata }) =>
        metadata.required === true &&
        metadata.hasDefaultValue !== true &&
        !selected.has(id) &&
        !locked.has(id)
    );
    if (missing.length) {
      throw new JiraFailureError(
        "FIELD_REQUIRED",
        "Required Jira fields are missing.",
        "error",
        { fields: missing.map(({ id, name }) => ({ id, name })) }
      );
    }
  }
  return Object.fromEntries(selected);
}
