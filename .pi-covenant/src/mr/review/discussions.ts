import { decodeGitlabPage, gitlabPageQuery } from "../../gitlab/module-port.js";
import type { MrIdentity, MrSelector } from "../invocation/ports.js";
import { MrOperationError, requireMrWire } from "../invocation/run.js";
import type { MrOperation } from "../invocation/run.js";
import {
  mrId,
  mrRecord,
  mrText,
  requireSelectedMr,
  selectExistingMr,
} from "../selection/select.js";

function mrDiscussionResolution(notes: readonly Record<string, unknown>[]) {
  if (notes.some((note) => typeof note.resolvable !== "boolean")) {
    throw new MrOperationError("INVALID_DISCUSSION");
  }
  const resolvable = notes.filter((note) => note.resolvable === true);
  if (resolvable.some((note) => typeof note.resolved !== "boolean")) {
    throw new MrOperationError("INVALID_DISCUSSION");
  }
  return {
    resolvable: resolvable.length > 0,
    resolved: resolvable.length
      ? resolvable.every((note) => note.resolved === true)
      : null,
  };
}
function mrDiscussionLocation(value: unknown) {
  const position = mrRecord(value);
  const newLine = mrId(position?.new_line);
  const oldLine = mrId(position?.old_line);
  const file = newLine
    ? mrText(position?.new_path)
    : (mrText(position?.old_path) ?? mrText(position?.new_path));
  return {
    file: file ?? null,
    line: file ? (newLine ?? oldLine ?? null) : null,
  };
}
export function decodeMrDiscussion(value: unknown) {
  const raw = mrRecord(value);
  const id = mrText(raw?.id);
  if (!id || !Array.isArray(raw?.notes) || raw.notes.length === 0) {
    throw new MrOperationError("INVALID_DISCUSSION");
  }
  const notes = raw.notes.map((item: unknown) => {
    const record = mrRecord(item);
    if (!record) {
      throw new MrOperationError("INVALID_DISCUSSION");
    }
    return record;
  });
  const [note] = notes;
  const author = mrRecord(note?.author);
  const authorId = mrId(author?.id);
  if (
    !authorId ||
    typeof author?.name !== "string" ||
    typeof note?.body !== "string"
  ) {
    throw new MrOperationError("INVALID_DISCUSSION");
  }
  return {
    author_id: String(authorId),
    author_name: author.name,
    body: note.body,
    id,
    is_bot: typeof author.bot === "boolean" ? author.bot : null,
    ...mrDiscussionResolution(notes),
    ...mrDiscussionLocation(
      raw.individual_note === true ? null : note.position
    ),
  };
}
async function fetchMrDiscussionPage(
  op: MrOperation,
  iid: number,
  projectId: number,
  page: number,
  pageSize: number
) {
  const wire = requireMrWire(
    await op.request({ iid, kind: "mrDiscussions", page, pageSize, projectId })
  );
  const { rows, next } = decodeGitlabPage(wire, page, pageSize);
  const threads = rows.map(decodeMrDiscussion);
  if (new Set(threads.map(({ id }) => id)).size !== threads.length) {
    throw new MrOperationError("INCOMPLETE_PAGINATION");
  }
  return { next, threads };
}
async function summarizeMrReview(
  op: MrOperation,
  iid: number,
  projectId: number
) {
  const seen = new Set<string>();
  let unresolved = 0;
  try {
    for (let page = 1; page <= 20; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each provider page must validate before continuing.
      const { threads, next } = await fetchMrDiscussionPage(
        op,
        iid,
        projectId,
        page,
        100
      );
      for (const thread of threads) {
        if (seen.has(thread.id)) {
          throw new MrOperationError("INCOMPLETE_PAGINATION");
        }
        seen.add(thread.id);
        if (thread.resolved === false) {
          unresolved += 1;
        }
      }
      if (next === null) {
        return { review_complete: true, unresolved_count: unresolved };
      }
    }
  } catch (error) {
    if (error instanceof MrOperationError && error.status === "cancelled") {
      throw error;
    }
  }
  op.requireActive();
  return { review_complete: false, unresolved_count: null };
}
function observedMrPipeline(value: unknown) {
  const raw = mrRecord(value);
  const id = mrId(raw?.id);
  const ref = mrText(raw?.ref);
  const sha = mrText(raw?.sha);
  const state = mrText(raw?.status);
  const url = mrText(raw?.web_url);
  const source = mrText(raw?.source);
  return id && ref && sha && state
    ? {
        id,
        ref,
        sha,
        state,
        ...(url ? { url } : {}),
        ...(source ? { source } : {}),
      }
    : null;
}
export async function readMrStatus(
  input: MrSelector,
  op: MrOperation,
  selection?: { branch: string; requireOpen?: boolean }
) {
  const selected = await selectExistingMr(input, op, selection?.branch);
  if (selection?.requireOpen && selected?.raw.state !== "opened") {
    throw new MrOperationError("MR_NOT_OPEN", "blocked");
  }
  const pipeline = observedMrPipeline(selected?.raw.head_pipeline);
  const identity: MrIdentity | null = selected?.identity ?? null;
  const review =
    selected && !selection
      ? await summarizeMrReview(op, selected.identity.iid, selected.projectId)
      : { review_complete: !selected, unresolved_count: null };
  return {
    merge_request: identity,
    pipeline,
    pipeline_matches_head:
      pipeline !== null && pipeline.sha === identity?.head_sha,
    selection: selected ? "found" : "absent",
    ...review,
  };
}
export async function readMrThreads(
  input: MrSelector & {
    cursor?: string;
    page_size?: number;
    include_resolved?: boolean;
  },
  op: MrOperation
) {
  const { cursor, page_size, include_resolved, ...selector } = input;
  const selected = requireSelectedMr(await selectExistingMr(selector, op));
  const { projectId, identity } = selected;
  const size = page_size ?? 50;
  const include = include_resolved ?? true;
  let query: ReturnType<typeof gitlabPageQuery>;
  try {
    query = gitlabPageQuery(
      cursor,
      [
        "mr-discussions",
        op.context.host,
        op.context.repository,
        identity.iid,
        size,
        include,
      ],
      projectId
    );
  } catch {
    throw new MrOperationError("INVALID_CURSOR", "blocked");
  }
  let page: Awaited<ReturnType<typeof fetchMrDiscussionPage>>;
  try {
    page = await fetchMrDiscussionPage(
      op,
      identity.iid,
      projectId,
      query.page,
      size
    );
  } catch (error) {
    throw error instanceof MrOperationError
      ? error
      : new MrOperationError("INCOMPLETE_PAGINATION");
  }
  return {
    complete: page.next === null,
    has_more: page.next !== null,
    merge_request: identity,
    next_cursor: page.next === null ? null : query.cursorFor(page.next),
    threads: page.threads.filter(
      (thread) => include || thread.resolved !== true
    ),
  };
}
