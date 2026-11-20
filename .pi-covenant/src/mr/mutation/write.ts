import type { MrIdentity, MrRequest, MrSelector } from "../invocation/ports.js";
import { MrOperationError, requireMrWire } from "../invocation/run.js";
import type { MrOperation } from "../invocation/run.js";
import { decodeMrDiscussion } from "../review/discussions.js";
import {
  fetchSelectedMr,
  mrId,
  mrRecord,
  requireSelectedMr,
  selectExistingMr,
} from "../selection/select.js";

async function withMrWritePermit<T>(
  op: MrOperation,
  iid: number,
  run: () => Promise<T>
) {
  const permit = op.host.acquireWrite?.(
    JSON.stringify([op.context.host, op.context.project_id, iid])
  );
  if (permit === null) {
    throw new MrOperationError("WRITE_CONFLICT", "blocked");
  }
  try {
    return await run();
  } finally {
    permit?.();
  }
}

async function sendMrWrite(
  op: MrOperation,
  request: MrRequest,
  phase: string,
  target: string,
  acknowledge: (value: unknown) => string | null
) {
  const wire = await op.request(request);
  if (wire.kind === "ok") {
    const reference = acknowledge(wire.body);
    if (reference !== null) {
      op.effects.push({ outcome: "committed", phase, reference, target });
      return reference;
    }
  } else if (wire.delivery !== "unknown") {
    throw new MrOperationError(
      wire.code,
      wire.code === "CANCELLED" ? "cancelled" : "error"
    );
  }
  op.effects.push({ outcome: "unknown", phase, target });
  throw new MrOperationError("REMOTE_STATE_UNKNOWN", "indeterminate");
}

async function readTargetDiscussion(
  op: MrOperation,
  target: { iid: number; projectId: number; threadId: string }
) {
  const wire = await op.request({ ...target, kind: "mrDiscussion" });
  if (wire.kind === "error" && wire.code === "NOT_FOUND") {
    throw new MrOperationError("THREAD_NOT_FOUND", "blocked");
  }
  const thread = decodeMrDiscussion(requireMrWire(wire).body);
  if (thread.id !== target.threadId) {
    throw new MrOperationError("THREAD_NOT_FOUND", "blocked");
  }
  return thread;
}

interface MrReplyData {
  merge_request: MrIdentity;
  thread_id: string;
  reply_id: string | null;
  reply_state: "committed" | "unknown";
  resolution_state:
    | "not_requested"
    | "unchanged"
    | "resolved"
    | "failed"
    | "unknown";
  observed_resolved: boolean | null;
}
export async function replyToMrDiscussion(
  input: MrSelector & { thread_id: string; body: string; resolve?: boolean },
  op: MrOperation
): Promise<{ data: MrReplyData; failure?: MrOperationError }> {
  const { thread_id, body, resolve, ...selector } = input;
  const { identity, projectId } = requireSelectedMr(
    await selectExistingMr(selector, op)
  );
  const { iid } = identity;
  return withMrWritePermit(op, iid, async () => {
    const target = { iid, projectId, threadId: thread_id };
    const thread = await readTargetDiscussion(op, target);
    if (resolve && !thread.resolvable) {
      throw new MrOperationError("NOT_RESOLVABLE", "blocked");
    }
    await op.authorize({
      action: "reply",
      details: { body, resolve: resolve ?? false, thread_id },
      iid,
    });
    const path = `!${iid}/${thread_id}`;
    let reply_id: string;
    try {
      reply_id = await sendMrWrite(
        op,
        { ...target, body, kind: "mrReply" },
        "reply",
        path,
        (value) => {
          const id = mrId(mrRecord(value)?.id);
          return id === undefined ? null : String(id);
        }
      );
    } catch (error) {
      if (
        error instanceof MrOperationError &&
        error.status === "indeterminate"
      ) {
        return {
          data: {
            merge_request: identity,
            observed_resolved: thread.resolved,
            reply_id: null,
            reply_state: "unknown",
            resolution_state: resolve ? "unchanged" : "not_requested",
            thread_id,
          },
          failure: error,
        };
      }
      throw error;
    }
    const data = {
      merge_request: identity,
      observed_resolved: thread.resolved,
      reply_id,
      reply_state: "committed" as const,
      thread_id,
    };
    if (!resolve || thread.resolved === true) {
      return {
        data: {
          ...data,
          resolution_state: resolve ? "unchanged" : "not_requested",
        },
      };
    }
    try {
      await sendMrWrite(
        op,
        { ...target, kind: "mrResolve" },
        "resolution",
        path,
        (value) => {
          const response = mrRecord(value);
          const notes = Array.isArray(response?.notes) ? response.notes : [];
          const resolvable = notes
            .map(mrRecord)
            .filter((note) => note?.resolvable === true);
          return response?.id === thread_id &&
            resolvable.length > 0 &&
            resolvable.every((note) => note?.resolved === true)
            ? thread_id
            : null;
        }
      );
      return {
        data: {
          ...data,
          observed_resolved: true,
          resolution_state: "resolved",
        },
      };
    } catch (error) {
      const unknown =
        error instanceof MrOperationError && error.status === "indeterminate";
      return {
        data: {
          ...data,
          observed_resolved: unknown ? null : thread.resolved,
          resolution_state: unknown ? "unknown" : "failed",
        },
        failure: new MrOperationError("RESOLUTION_FAILED", "partial"),
      };
    }
  });
}

export async function updateMrMetadata(
  input: MrSelector & { title?: string; description?: string },
  op: MrOperation
) {
  const { title, description, ...selector } = input;
  if (title === undefined && description === undefined) {
    throw new MrOperationError("EMPTY_PATCH", "blocked");
  }
  const { identity, projectId } = requireSelectedMr(
    await selectExistingMr(selector, op)
  );
  const { iid } = identity;
  return withMrWritePermit(op, iid, async () => {
    const current = await fetchSelectedMr(op, iid, projectId);
    const prefix =
      title === undefined
        ? undefined
        : await op.host.titlePrefix?.(
            `https://${op.context.host}/${op.context.repository}`
          );
    if (prefix && !title?.startsWith(prefix)) {
      throw new MrOperationError("TITLE_POLICY_FAILED", "blocked", { prefix });
    }
    const patch = {
      ...(title !== undefined && title !== current.raw.title ? { title } : {}),
      ...(description !== undefined && description !== current.raw.description
        ? { description }
        : {}),
    };
    const changed_fields = Object.keys(patch);
    if (changed_fields.length === 0) {
      return {
        data: {
          changed_fields,
          merge_request: current.identity,
          no_change: true,
          readback_complete: true,
        },
      };
    }
    await op.authorize({ action: "update", details: patch, iid });
    await sendMrWrite(
      op,
      { iid, kind: "mrUpdate", patch, projectId },
      "update",
      `!${iid}`,
      (value) => {
        const response = mrRecord(value);
        return response?.iid === iid && response.target_project_id === projectId
          ? String(iid)
          : null;
      }
    );
    const data = { changed_fields, no_change: false };
    try {
      const readback = await fetchSelectedMr(op, iid, projectId);
      if (
        Object.entries(patch).some(
          ([field, value]) => readback.raw[field] !== value
        )
      ) {
        throw new MrOperationError("READBACK_FAILED");
      }
      return {
        data: {
          ...data,
          merge_request: readback.identity,
          readback_complete: true,
        },
      };
    } catch {
      return {
        data: {
          ...data,
          merge_request: current.identity,
          readback_complete: false,
        },
        failure: new MrOperationError("READBACK_FAILED", "partial"),
      };
    }
  });
}
