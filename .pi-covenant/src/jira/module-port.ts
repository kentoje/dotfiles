import { Type } from "typebox";

import { createJiraIssue } from "./creation/create.js";
import type { JiraHost, JiraInvocation } from "./invocation/ports.js";
import { runJiraOperation } from "./invocation/run.js";
import {
  commentJiraIssue,
  transitionJiraIssue,
  updateJiraIssue,
} from "./issues/mutate.js";
import { jiraIssueKey, jiraProjectKey, readJiraIssue } from "./issues/read.js";
import { searchJiraIssues } from "./search/search.js";

const text = Type.String({ minLength: 1, pattern: "\\S" });
const fields = Type.Record(Type.String(), Type.Unknown());
const site = Type.Optional(text);
const key = Type.String({ pattern: jiraIssueKey.source });
const project = Type.String({ maxLength: 120, pattern: jiraProjectKey.source });
const closed = { additionalProperties: false };

const inputs = {
  comment: Type.Object(
    {
      body: Type.String({ maxLength: 32_767, minLength: 1, pattern: "\\S" }),
      key,
      site,
    },
    closed
  ),
  create: Type.Object(
    {
      fields: Type.Optional(fields),
      issue_type: text,
      project,
      site,
      summary: Type.String({ maxLength: 255, minLength: 1, pattern: "\\S" }),
    },
    closed
  ),
  get: Type.Object(
    {
      fields: Type.Optional(
        Type.Array(Type.String({ pattern: "^[A-Za-z0-9_]+$" }), {
          maxItems: 100,
        })
      ),
      key,
      site,
    },
    closed
  ),
  search: Type.Object(
    {
      cursor: Type.Optional(Type.String({ maxLength: 8192, minLength: 1 })),
      page_size: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
      project: Type.Optional(project),
      query: Type.String({ maxLength: 4000, minLength: 1, pattern: "\\S" }),
      site,
    },
    closed
  ),
  transition: Type.Object(
    { fields: Type.Optional(fields), key, site, transition: text },
    closed
  ),
  update: Type.Object({ fields, key, site }, closed),
};

/** Create the credential-free Jira operations over the trusted host request and confirmation ports. */
export function makeJiraModule(host: JiraHost) {
  return {
    comment: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "comment",
        host,
        input,
        invocation,
        run: commentJiraIssue,
        schema: inputs.comment,
      }),
    create: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "create",
        host,
        input,
        invocation,
        run: createJiraIssue,
        schema: inputs.create,
      }),
    get: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "get",
        host,
        input,
        invocation,
        run: readJiraIssue,
        schema: inputs.get,
      }),
    search: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "search",
        host,
        input,
        invocation,
        run: searchJiraIssues,
        schema: inputs.search,
      }),
    transition: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "transition",
        host,
        input,
        invocation,
        run: transitionJiraIssue,
        schema: inputs.transition,
      }),
    update: (input: unknown, invocation: JiraInvocation = {}) =>
      runJiraOperation({
        action: "update",
        host,
        input,
        invocation,
        run: updateJiraIssue,
        schema: inputs.update,
      }),
  };
}

export type {
  JiraHost,
  JiraRequest,
  JiraResponse,
} from "./invocation/ports.js";
