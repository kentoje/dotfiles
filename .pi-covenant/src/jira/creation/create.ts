import { evaluateJiraDuplicates } from "../../jira-preflight/module-port.js";
import {
  readJiraField,
  resolveJiraFields,
  selectJiraOption,
} from "../fields/resolve.js";
import { JiraFailureError } from "../invocation/run.js";
import type { JiraOperation } from "../invocation/run.js";
import {
  incompleteJiraReadback,
  refreshJiraIssue,
  submitJiraWrite,
} from "../issues/mutate.js";
import { jiraIssueKey, jiraObject, jiraString } from "../issues/read.js";
import { fetchJiraPage } from "../search/search.js";

const pageLimit = 20;
const lockedCreateFields = new Set(["project", "issuetype", "summary"]);

async function fetchJiraCreateMetadata(
  op: JiraOperation,
  project: string,
  type?: string
) {
  const entries: unknown[] = [];
  for (let page = 0; page < pageLimit; page += 1) {
    const start = entries.length;
    // oxlint-disable-next-line no-await-in-loop -- Each offset depends on the preceding page size.
    const response = await op.read({
      project,
      route: type ? "create-fields" : "types",
      start,
      ...(type ? { type } : {}),
    });
    const raw = jiraObject(response);
    const items = raw?.[type ? "fields" : "issueTypes"];
    const total = raw?.total;
    if (
      !Array.isArray(items) ||
      raw?.startAt !== start ||
      typeof total !== "number" ||
      !Number.isSafeInteger(total) ||
      total < start + items.length
    ) {
      break;
    }
    entries.push(...items);
    if (entries.length === total) {
      return entries;
    }
    if (items.length === 0) {
      break;
    }
  }
  throw new JiraFailureError(
    "LOOKUP_FAILED",
    "Jira create metadata did not return a complete bounded collection."
  );
}

async function collectJiraDuplicates(op: JiraOperation, project: string) {
  const query = new URLSearchParams({
    jql: `project = "${project}" ORDER BY key ASC`,
    maxResults: "100",
  });
  const candidates = new Map<
    string,
    { key: string; summary: string; state: string }
  >();
  const tokens = new Set<string>();
  for (let page = 0; page < pageLimit; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- The next page requires the provider continuation from this page.
    const result = await fetchJiraPage(query, op, project);
    for (const { key, summary, state } of result.issues) {
      const previous = candidates.get(key);
      if (
        previous &&
        (previous.state !== state || previous.summary !== summary)
      ) {
        throw new JiraFailureError(
          "SEARCH_INCOMPLETE",
          "An issue changed during duplicate pagination.",
          "blocked"
        );
      }
      candidates.set(key, { key, state, summary });
    }
    if (!result.token) {
      return { candidates: [...candidates.values()], complete: true };
    }
    if (tokens.has(result.token)) {
      break;
    }
    tokens.add(result.token);
    query.set("nextPageToken", result.token);
  }
  return { candidates: [...candidates.values()], complete: false };
}

async function checkJiraCreateDuplicates(
  op: JiraOperation,
  proposal: { project: string; issue_type: string; summary: string }
) {
  let scan: Awaited<ReturnType<typeof collectJiraDuplicates>>;
  try {
    scan = await collectJiraDuplicates(op, proposal.project);
  } catch (error) {
    if (error instanceof JiraFailureError && error.status === "cancelled") {
      throw error;
    }
    throw new JiraFailureError(
      "LOOKUP_FAILED",
      "Jira duplicate preflight could not complete the selected project search.",
      "blocked"
    );
  }
  const result = evaluateJiraDuplicates({
    ...proposal,
    site: op.site,
    ...scan,
  });
  if (result.data.decision === "blocked") {
    throw new JiraFailureError(
      "SEARCH_INCOMPLETE",
      "Jira duplicate preflight reached its page bound or a repeated cursor.",
      "blocked"
    );
  }
  const keys = new Set(result.data.matches);
  return {
    identity: result.data.proposal_identity,
    matches: scan.candidates.filter(({ key }) => keys.has(key)),
  };
}

async function resolveJiraIssueType(
  op: JiraOperation,
  project: string,
  supplied: string
) {
  const rawTypes = await fetchJiraCreateMetadata(op, project);
  const types = rawTypes.map((value) => {
    const raw = jiraObject(value);
    const id = jiraString(raw?.id);
    const name = jiraString(raw?.name);
    if (!id || !/^\d+$/u.test(id) || !name) {
      throw new JiraFailureError(
        "LOOKUP_FAILED",
        "Jira returned invalid issue type metadata."
      );
    }
    return { id, name };
  });
  const selected = selectJiraOption(supplied, types);
  const [type] = selected;
  if (!type || selected.length !== 1) {
    throw new JiraFailureError(
      type ? "FIELD_AMBIGUOUS" : "FIELD_UNSUPPORTED",
      "Choose an available Jira issue type ID.",
      "error",
      { types }
    );
  }
  return type.id;
}

export async function createJiraIssue(
  input: {
    project: string;
    issue_type: string;
    summary: string;
    fields?: Record<string, unknown>;
  },
  op: JiraOperation
) {
  const { project, summary } = input;
  op.context.project = project;
  const type = await resolveJiraIssueType(op, project, input.issue_type);
  const rawFields = await fetchJiraCreateMetadata(op, project, type);
  const metadata = rawFields.map((value) => {
    const raw = jiraObject(value);
    return readJiraField(raw?.fieldId ?? raw?.key, raw);
  });
  const fields = resolveJiraFields(
    input.fields ?? {},
    metadata,
    lockedCreateFields,
    true
  );
  const body = {
    fields: {
      ...fields,
      issuetype: { id: type },
      project: { key: project },
      summary,
    },
  };
  const proposal = { issue_type: type, project, summary };
  const duplicate = await checkJiraCreateDuplicates(op, proposal);
  await op.confirm(
    {
      action: "create",
      payload: body,
      project,
      ...(duplicate.matches.length ? { duplicate } : {}),
    },
    duplicate.matches.length ? "DUPLICATE_DECISION_REQUIRED" : undefined
  );
  const current = await checkJiraCreateDuplicates(op, proposal);
  if (current.identity !== duplicate.identity) {
    throw new JiraFailureError(
      "DUPLICATE_DECISION_REQUIRED",
      "Visible duplicate evidence changed after confirmation. Review the updated proposal.",
      "blocked",
      current
    );
  }
  const ack = await submitJiraWrite({ body, route: "create" }, project, op);
  const key = jiraString(ack?.key);
  const id = jiraString(ack?.id);
  op.context.readback_complete = false;
  if (
    !key ||
    !jiraIssueKey.test(key) ||
    !key.startsWith(`${project}-`) ||
    !id
  ) {
    incompleteJiraReadback();
  }
  op.context.key = key;
  op.context.id = id;
  const effect = op.effects.at(-1);
  if (effect) {
    effect.reference = key;
  }
  return refreshJiraIssue(key, op, id, project);
}
