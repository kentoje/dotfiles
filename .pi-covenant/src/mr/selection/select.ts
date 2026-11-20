import { Effect } from "effect";

import type { MrIdentity, MrSelector } from "../invocation/ports.js";
import { MrOperationError, requireMrWire } from "../invocation/run.js";
import type { MrOperation } from "../invocation/run.js";

export function mrRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : undefined;
}
export function mrText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
export function mrId(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined;
}

export async function fetchSelectedMr(
  op: MrOperation,
  iid: number,
  projectId: number
) {
  const wire = requireMrWire(await op.request({ iid, kind: "mr", projectId }));
  const raw = mrRecord(wire.body);
  const head = mrText(raw?.sha);
  const source = mrText(raw?.source_branch);
  const target = mrText(raw?.target_branch);
  if (
    !raw ||
    raw.iid !== iid ||
    raw.target_project_id !== projectId ||
    !head ||
    !source ||
    !target
  ) {
    throw new MrOperationError("TARGET_MISMATCH", "blocked");
  }
  const title = mrText(raw.title);
  const url = mrText(raw.web_url);
  const identity: MrIdentity = {
    head_sha: head,
    iid,
    source_branch: source,
    target_branch: target,
    ...(title ? { title } : {}),
    ...(url ? { url } : {}),
    ...(typeof raw.draft === "boolean" ? { draft: raw.draft } : {}),
  };
  return { identity, projectId, raw };
}

async function selectBranchMr(
  repository: string,
  branch: string | undefined | null,
  projectId: number,
  op: MrOperation
) {
  if (!branch) {
    throw new MrOperationError("SOURCE_BRANCH_UNAVAILABLE", "blocked");
  }
  op.requireActive();
  const lookup = await Effect.runPromise(
    op.host.gitlab.lookup_open_mrs(
      { repository, source_branch: branch },
      op.invocation
    )
  );
  if (
    !lookup.data?.complete ||
    lookup.context.project_id !== projectId ||
    lookup.context.host !== op.context.host ||
    lookup.context.repository !== op.context.repository
  ) {
    throw new MrOperationError(
      lookup.error?.code ?? "LOOKUP_FAILED",
      "blocked"
    );
  }
  const candidates = lookup.data.matches.map((match) => ({
    ...match,
    source_branch: branch,
  }));
  if (candidates.length > 1) {
    throw new MrOperationError("AMBIGUOUS_MR", "blocked", { candidates });
  }
  const [match] = candidates;
  return match?.iid;
}

export async function selectExistingMr(
  input: MrSelector,
  op: MrOperation,
  branchOverride?: string
) {
  const { iid, ...selector } = input;
  const repo = await Effect.runPromise(
    op.host.gitlab.repository(selector, op.invocation)
  );
  const { host, project_id: projectId, repository } = repo.context;
  if (!repo.data || !host || !repository || !projectId) {
    throw new MrOperationError(
      repo.error?.code ?? "CONTEXT_UNAVAILABLE",
      "blocked"
    );
  }
  Object.assign(op.context, { host, project_id: projectId, repository });
  const branch = branchOverride ?? repo.data.identity.branch;
  const selected =
    iid ??
    (await selectBranchMr(
      `https://${host}/${repository}`,
      branch,
      projectId,
      op
    ));
  if (selected === undefined) {
    return null;
  }
  op.context.iid = selected;
  const mr = await fetchSelectedMr(op, selected, projectId);
  if (
    iid === undefined &&
    (mr.identity.source_branch !== branch ||
      mr.raw.state !== "opened" ||
      mr.raw.source_project_id !== projectId)
  ) {
    throw new MrOperationError("TARGET_MISMATCH", "blocked");
  }
  return mr;
}

export function requireSelectedMr(
  value: Awaited<ReturnType<typeof selectExistingMr>>
) {
  if (!value) {
    throw new MrOperationError("MR_NOT_FOUND", "blocked");
  }
  return value;
}
