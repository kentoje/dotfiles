import {
  readJiraFields,
  resolveJiraFields,
  selectJiraOption,
} from "../fields/resolve.js";
import type { JiraRequest } from "../invocation/ports.js";
import { JiraFailureError } from "../invocation/run.js";
import type { JiraOperation } from "../invocation/run.js";
import { jiraObject, jiraString, readJiraIssue } from "./read.js";

type WriteRequest = Extract<JiraRequest, { body: Record<string, unknown> }>;

export async function submitJiraWrite(
  req: WriteRequest,
  target: string,
  op: JiraOperation
) {
  const response = await op.send(req);
  if (response.kind === "rejected") {
    if (response.status === 409) {
      throw new JiraFailureError(
        "STATE_CONFLICT",
        "Jira rejected the write because the current state conflicted with the request."
      );
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404
    ) {
      throw new JiraFailureError(
        "FORBIDDEN",
        "Jira rejected access to the selected write target."
      );
    }
    throw new JiraFailureError(
      "WRITE_REJECTED",
      "Jira rejected the write. Review current field metadata or permissions.",
      "error",
      { status: response.status }
    );
  }
  if (response.kind === "stopped") {
    throw new JiraFailureError(
      "JIRA_STOPPED",
      "Jira write stopped before dispatch.",
      "cancelled"
    );
  }
  if (response.kind !== "ok" && response.kind !== "acknowledged") {
    op.effects.push({ outcome: "unknown", phase: req.route, target });
    throw new JiraFailureError(
      "REMOTE_STATE_UNKNOWN",
      "Jira write delivery is unknown. Inspect the target before submitting another write.",
      "indeterminate"
    );
  }
  op.effects.push({ outcome: "committed", phase: req.route, target });
  return response.kind === "ok" ? jiraObject(response.data) : undefined;
}

export function incompleteJiraReadback(): never {
  throw new JiraFailureError(
    "READBACK_FAILED",
    "Jira acknowledged the write, but the resulting issue view is unavailable.",
    "partial"
  );
}

export async function refreshJiraIssue(
  key: string,
  op: JiraOperation,
  expectedId?: string,
  project?: string
) {
  op.context.readback_complete = false;
  try {
    const issue = await readJiraIssue({ key }, op);
    if (
      (expectedId && issue.id !== expectedId) ||
      (project && jiraObject(issue.fields?.project)?.key !== project)
    ) {
      incompleteJiraReadback();
    }
    op.context.readback_complete = true;
    return issue;
  } catch {
    return incompleteJiraReadback();
  }
}

export async function updateJiraIssue(
  input: { key: string; fields: Record<string, unknown> },
  op: JiraOperation
) {
  if (Object.keys(input.fields).length === 0) {
    throw new JiraFailureError(
      "EMPTY_PATCH",
      "Provide at least one Jira field to update."
    );
  }
  const { key, id } = await readJiraIssue({ key: input.key }, op);
  const meta = jiraObject(await op.read({ key, route: "edit-fields" }));
  const fields = resolveJiraFields(
    input.fields,
    readJiraFields(meta?.fields),
    new Set(),
    false
  );
  const body = { fields };
  await op.confirm({ action: "update", key, payload: body });
  await submitJiraWrite({ body, key, route: "update" }, key, op);
  const changed_fields = Object.keys(fields);
  op.context.changed_fields = changed_fields;
  return {
    changed_fields,
    issue: await refreshJiraIssue(key, op, id),
    readback_complete: true,
  };
}

export async function commentJiraIssue(
  input: { key: string; body: string },
  op: JiraOperation
) {
  const { key } = await readJiraIssue({ key: input.key }, op);
  const body = {
    body: {
      content: input.body.split(/\r\n|\r|\n/u).map((text) => ({
        content: text ? [{ text, type: "text" }] : [],
        type: "paragraph",
      })),
      type: "doc",
      version: 1,
    },
  };
  await op.confirm({ action: "comment", key, payload: body });
  const ack = await submitJiraWrite({ body, key, route: "comment" }, key, op);
  const comment_id = jiraString(ack?.id);
  if (!comment_id) {
    incompleteJiraReadback();
  }
  return { body: input.body, comment_id, key };
}

function readJiraTransitions(value: unknown) {
  const transitions = jiraObject(value)?.transitions;
  if (!Array.isArray(transitions)) {
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira returned invalid transitions."
    );
  }
  return transitions
    .map((item: unknown) => {
      const raw = jiraObject(item);
      const id = jiraString(raw?.id);
      const name = jiraString(raw?.name);
      if (
        !id ||
        !name ||
        (raw?.isAvailable !== undefined && typeof raw.isAvailable !== "boolean")
      ) {
        throw new JiraFailureError(
          "LOOKUP_FAILED",
          "Jira returned a transition without usable identity."
        );
      }
      return {
        available: raw?.isAvailable !== false,
        fields: raw?.fields,
        id,
        name,
      };
    })
    .filter(({ available }) => available);
}

export async function transitionJiraIssue(
  input: { key: string; transition: string; fields?: Record<string, unknown> },
  op: JiraOperation
) {
  const { key, id } = await readJiraIssue({ key: input.key }, op);
  const choices = readJiraTransitions(
    await op.read({ key, route: "transitions" })
  );
  const matches = selectJiraOption(input.transition, choices);
  const [selected] = matches;
  if (!selected || matches.length !== 1) {
    throw new JiraFailureError(
      selected ? "TRANSITION_AMBIGUOUS" : "TRANSITION_UNAVAILABLE",
      "Choose an available Jira transition ID.",
      "error",
      { choices: choices.map(({ id: tid, name }) => ({ id: tid, name })) }
    );
  }
  const fields = resolveJiraFields(
    input.fields ?? {},
    readJiraFields(selected.fields),
    new Set(),
    true
  );
  const body = { fields, transition: { id: selected.id } };
  await op.confirm({ action: "transition", key, payload: body });
  await submitJiraWrite({ body, key, route: "transition" }, key, op);
  op.context.transition_id = selected.id;
  return {
    issue: await refreshJiraIssue(key, op, id),
    readback_complete: true,
    transition_id: selected.id,
  };
}
