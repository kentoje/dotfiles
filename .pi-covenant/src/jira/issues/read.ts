import { JiraFailureError } from "../invocation/run.js";
import type { JiraOperation } from "../invocation/run.js";

export function jiraObject(
  value: unknown
): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
export function jiraString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}
export const jiraIssueKey = /^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/u;
export const jiraProjectKey = /^[A-Z][A-Z0-9_]*$/u;

export function decodeJiraIssue(
  value: unknown,
  site: string,
  project?: string
) {
  const raw = jiraObject(value);
  const key = jiraString(raw?.key);
  const fields = jiraObject(raw?.fields);
  const summary = fields?.summary;
  const state = jiraString(jiraObject(fields?.status)?.name);
  const id = jiraString(raw?.id);
  if (
    !key ||
    !jiraIssueKey.test(key) ||
    typeof summary !== "string" ||
    !state ||
    (project && jiraObject(fields?.project)?.key !== project)
  ) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira returned an invalid issue or an issue outside the selected project."
    );
  }
  return {
    key,
    state,
    summary,
    url: `${site}/browse/${key}`,
    ...(id ? { id } : {}),
    ...(fields ? { fields } : {}),
  };
}

export async function readJiraIssue(
  input: { key: string; fields?: readonly string[] },
  op: JiraOperation
) {
  op.context.key = input.key;
  const result = decodeJiraIssue(
    await op.read({ route: "issue", ...input }),
    op.site
  );
  if (result.key !== input.key) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira returned a different issue identity."
    );
  }
  return result;
}
