import { createHash } from "node:crypto";

import { JiraFailureError } from "../invocation/run.js";
import type { JiraOperation } from "../invocation/run.js";
import { jiraObject, jiraString, decodeJiraIssue } from "../issues/read.js";

function invalidJiraQuery(): never {
  throw new JiraFailureError(
    "INVALID_QUERY",
    "Jira project scope requires a balanced JQL expression."
  );
}

function jiraOrderOffset(query: string) {
  let quote = "";
  let depth = 0;
  let index = 0;
  while (index < query.length) {
    const char = query[index] ?? "";
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = "";
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) {
        invalidJiraQuery();
      }
    } else if (
      depth === 0 &&
      (index === 0 || /\s/u.test(query[index - 1] ?? "")) &&
      /^ORDER\s+BY(?:\s|$)/iu.test(query.slice(index))
    ) {
      return index;
    }
    index += 1;
  }
  if (quote || depth !== 0) {
    invalidJiraQuery();
  }
  return query.length;
}

function jiraScopedJql(query: string, project: string | undefined) {
  if (!project) {
    return query;
  }
  const offset = jiraOrderOffset(query);
  const expression = query.slice(0, offset).trim();
  const ordering = query.slice(offset);
  return [
    `project = "${project}"`,
    ...(expression ? [`AND (${expression})`] : []),
    ...(ordering ? [ordering] : []),
  ].join(" ");
}

export async function fetchJiraPage(
  query: URLSearchParams,
  op: JiraOperation,
  project?: string
) {
  query.set("fields", "summary,status,project");
  const raw = jiraObject(await op.read({ query, route: "search" }));
  const token = jiraString(raw?.nextPageToken);
  if (
    !raw ||
    !Array.isArray(raw.issues) ||
    typeof raw.isLast !== "boolean" ||
    raw.isLast === Boolean(token)
  ) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira search returned incomplete pagination evidence."
    );
  }
  return {
    issues: raw.issues.map((issue: unknown) =>
      decodeJiraIssue(issue, op.site, project)
    ),
    token,
  };
}

function decodeJiraCursor(cursor: string, binding: string) {
  if (
    !cursor.startsWith(`${binding}.`) ||
    !/^[a-f0-9]+\.[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    throw new JiraFailureError(
      "INVALID_CURSOR",
      "Jira cursor does not match this site, project, query and page size."
    );
  }
  return Buffer.from(cursor.slice(binding.length + 1), "base64url").toString();
}

export async function searchJiraIssues(
  input: {
    query: string;
    project?: string;
    page_size?: number;
    cursor?: string;
  },
  op: JiraOperation
) {
  const pageSize = input.page_size ?? 50;
  const binding = createHash("sha256")
    .update(
      JSON.stringify([op.site, input.project ?? null, input.query, pageSize])
    )
    .digest("hex");
  const query = new URLSearchParams({
    jql: jiraScopedJql(input.query, input.project),
    maxResults: String(pageSize),
  });
  if (input.project) {
    op.context.project = input.project;
  }
  if (input.cursor) {
    query.set("nextPageToken", decodeJiraCursor(input.cursor, binding));
  }
  const { issues, token } = await fetchJiraPage(query, op, input.project);
  return {
    complete: !token,
    has_more: Boolean(token),
    issues,
    next_cursor: token
      ? `${binding}.${Buffer.from(token).toString("base64url")}`
      : null,
  };
}
