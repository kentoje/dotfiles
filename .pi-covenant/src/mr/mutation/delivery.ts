import { Effect } from "effect";

import { MrOperationError, requireMrWire } from "../invocation/run.js";
import type { MrOperation } from "../invocation/run.js";
import {
  fetchSelectedMr,
  mrId,
  mrRecord,
  mrText,
} from "../selection/select.js";

export interface MrDraftInput {
  repository: string;
  source_branch: string;
  target_branch: string;
  title: string;
  description?: string;
  expected_head_sha: string;
}
interface MrReadyInput {
  repository: string;
  iid: number;
  expected_head_sha: string;
}

const draftPrefix =
  /^(?:Draft:\s*|\[Draft\]\s*|\(Draft\)\s*|WIP:\s*|\[WIP\]\s*|\(WIP\)\s*)/iu;

async function resolveMrDeliveryProject(op: MrOperation, repository: string) {
  const selection = await Effect.runPromise(
    op.host.gitlab.repository({ repository }, op.invocation)
  );
  const { host, repository: path, project_id } = selection.context;
  if (!selection.data || !host || !path || !project_id) {
    throw new MrOperationError(
      selection.error?.code ?? "CONTEXT_UNAVAILABLE",
      "blocked"
    );
  }
  Object.assign(op.context, { host, project_id, repository: path });
  return project_id;
}

async function requireMrBranch(
  op: MrOperation,
  projectId: number,
  branch: string,
  expected?: string
) {
  const response = requireMrWire(
    await op.request({ branch, kind: "mrBranch", projectId })
  );
  const value = mrRecord(response.body);
  const sha = mrText(mrRecord(value?.commit)?.id);
  if (value?.name !== branch || !sha || (expected && sha !== expected)) {
    throw new MrOperationError("HEAD_CHANGED", "blocked");
  }
}

function readMrDeliveryAck(
  response: Awaited<ReturnType<MrOperation["request"]>>,
  iid?: number
) {
  if (response.kind === "error" && response.delivery === "unknown") {
    throw new MrOperationError(
      "REMOTE_STATE_UNKNOWN",
      "indeterminate",
      iid ? { iid } : {}
    );
  }
  return mrRecord(requireMrWire(response).body);
}

/** Internal shipping port. The caller supplies guarded creation authority and the expected pushed SHA. */
export async function createMrDraft(input: MrDraftInput, op: MrOperation) {
  const projectId = await resolveMrDeliveryProject(op, input.repository);
  await requireMrBranch(op, projectId, input.target_branch);
  await op.authorize({ action: "create_draft", details: { ...input }, iid: 0 });
  await requireMrBranch(
    op,
    projectId,
    input.source_branch,
    input.expected_head_sha
  );
  const title = `Draft: ${input.title.replace(draftPrefix, "")}`;
  const response = await op.request({
    kind: "mrCreate",
    projectId,
    sourceBranch: input.source_branch,
    targetBranch: input.target_branch,
    title,
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
  });
  const body = readMrDeliveryAck(response);
  const iid = mrId(body?.iid);
  const url = mrText(body?.web_url);
  if (
    !iid ||
    !url ||
    body?.draft !== true ||
    body.sha !== input.expected_head_sha ||
    body.target_project_id !== projectId ||
    body.source_project_id !== projectId ||
    body.source_branch !== input.source_branch ||
    body.target_branch !== input.target_branch
  ) {
    throw new MrOperationError(
      "REMOTE_STATE_UNKNOWN",
      "indeterminate",
      iid ? { iid } : {}
    );
  }
  op.effects.push({
    outcome: "committed",
    phase: "draft",
    reference: String(iid),
    target: `!${iid}`,
  });
  return { data: { draft: true, head_sha: input.expected_head_sha, iid, url } };
}

export interface MrReadyBranches {
  source: string;
  target: string;
}

function matchesMrReadyScope(
  mr: Awaited<ReturnType<typeof fetchSelectedMr>>,
  head: string,
  branches: MrReadyBranches | undefined
) {
  return (
    mr.identity.head_sha === head &&
    mr.raw.state === "opened" &&
    (!branches ||
      (mr.identity.source_branch === branches.source &&
        mr.identity.target_branch === branches.target))
  );
}

export async function markMrReady(
  input: MrReadyInput,
  op: MrOperation,
  branches?: MrReadyBranches
) {
  const projectId = await resolveMrDeliveryProject(op, input.repository);
  const { iid, expected_head_sha } = input;
  const current = await fetchSelectedMr(op, iid, projectId);
  if (!matchesMrReadyScope(current, expected_head_sha, branches)) {
    throw new MrOperationError("HEAD_CHANGED", "blocked");
  }
  if (current.identity.draft === false) {
    return { data: { draft: false, head_sha: expected_head_sha, iid } };
  }
  const title = current.identity.title?.replace(draftPrefix, "");
  if (
    current.identity.draft !== true ||
    !title ||
    title === current.identity.title
  ) {
    throw new MrOperationError("MR_STATE_UNKNOWN", "blocked");
  }
  await op.authorize({
    action: "mark_ready",
    details: { head: expected_head_sha, title },
    iid,
  });
  const exact = await fetchSelectedMr(op, iid, projectId);
  if (
    !matchesMrReadyScope(exact, expected_head_sha, branches) ||
    exact.identity.title !== current.identity.title
  ) {
    throw new MrOperationError("HEAD_CHANGED", "blocked");
  }
  const response = await op.request({
    iid,
    kind: "mrUpdate",
    patch: { title },
    projectId,
  });
  const updated = readMrDeliveryAck(response, iid);
  if (
    updated?.iid !== iid ||
    updated.target_project_id !== projectId ||
    updated.draft !== false ||
    updated.sha !== expected_head_sha
  ) {
    throw new MrOperationError("REMOTE_STATE_UNKNOWN", "indeterminate", {
      iid,
    });
  }
  op.effects.push({
    outcome: "committed",
    phase: "ready",
    reference: String(iid),
    target: `!${iid}`,
  });
  try {
    const refreshed = await fetchSelectedMr(op, iid, projectId);
    if (
      !matchesMrReadyScope(refreshed, expected_head_sha, branches) ||
      refreshed.identity.draft !== false
    ) {
      throw new MrOperationError("HEAD_CHANGED");
    }
  } catch {
    return {
      data: { draft: false, head_sha: expected_head_sha, iid },
      failure: new MrOperationError("READY_READBACK_FAILED", "partial", {
        iid,
      }),
    };
  }
  return { data: { draft: false, head_sha: expected_head_sha, iid } };
}
