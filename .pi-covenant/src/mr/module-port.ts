import { Type } from "typebox";

import type { GitlabReadInvocation } from "../gitlab/module-port.js";
import type { MrHost } from "./invocation/ports.js";
import { runMrOperation } from "./invocation/run.js";
import type { MrReadyBranches } from "./mutation/delivery.js";
import { createMrDraft, markMrReady } from "./mutation/delivery.js";
import { replyToMrDiscussion, updateMrMetadata } from "./mutation/write.js";
import { readMrStatus, readMrThreads } from "./review/discussions.js";

const text = Type.String({ minLength: 1, pattern: "\\S" });
const selector = {
  cwd: Type.Optional(text),
  iid: Type.Optional(
    Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 })
  ),
  repository: Type.Optional(text),
};
const closed = { additionalProperties: false };
const status = Type.Object(selector, closed);
const threads = Type.Object(
  {
    ...selector,
    cursor: Type.Optional(text),
    include_resolved: Type.Optional(Type.Boolean()),
    page_size: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
  },
  closed
);
const reply = Type.Object(
  {
    ...selector,
    body: Type.String({ maxLength: 65_000, minLength: 1, pattern: "\\S" }),
    resolve: Type.Optional(Type.Boolean()),
    thread_id: Type.String({ pattern: "^[A-Za-z0-9_-]{1,128}$" }),
  },
  closed
);
const update = Type.Object(
  {
    ...selector,
    description: Type.Optional(Type.String({ maxLength: 65_000 })),
    title: Type.Optional(
      Type.String({ maxLength: 255, minLength: 1, pattern: "\\S" })
    ),
  },
  closed
);

const draft = Type.Object(
  {
    description: Type.Optional(Type.String({ maxLength: 65_000 })),
    expected_head_sha: text,
    repository: text,
    source_branch: text,
    target_branch: text,
    title: Type.String({ maxLength: 240, minLength: 1, pattern: "\\S" }),
  },
  closed
);
const ready = Type.Object(
  {
    expected_head_sha: text,
    iid: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
    repository: text,
  },
  closed
);

/** Existing MR operations. The optional status scope is host-only and skips review collection for preflight. */
export function makeMrModule(host: MrHost) {
  return {
    create_draft: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runMrOperation({
        action: "create_draft",
        host,
        input,
        invocation,
        run: createMrDraft,
        schema: draft,
        write: true,
      }),
    mark_ready: (
      input: unknown,
      invocation: GitlabReadInvocation = {},
      branches?: MrReadyBranches
    ) =>
      runMrOperation({
        action: "mark_ready",
        host,
        input,
        invocation,
        run: (args, op) => markMrReady(args, op, branches),
        schema: ready,
        write: true,
      }),
    reply: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runMrOperation({
        action: "reply",
        host,
        input,
        invocation,
        run: async (args, op) => await replyToMrDiscussion(args, op),
        schema: reply,
        write: true,
      }),
    status: (
      input: unknown,
      invocation: GitlabReadInvocation = {},
      selection?: { branch: string; requireOpen?: boolean }
    ) =>
      runMrOperation({
        action: "status",
        host,
        input,
        invocation,
        run: async (args, op) => ({
          data: await readMrStatus(args, op, selection),
        }),
        schema: status,
      }),
    threads: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runMrOperation({
        action: "threads",
        host,
        input,
        invocation,
        run: async (args, op) => ({ data: await readMrThreads(args, op) }),
        schema: threads,
      }),
    update: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      runMrOperation({
        action: "update",
        host,
        input,
        invocation,
        run: updateMrMetadata,
        schema: update,
        write: true,
      }),
  };
}
export type {
  MrContext,
  MrHost,
  MrIdentity,
  MrRequest,
  MrSelector,
} from "./invocation/ports.js";
