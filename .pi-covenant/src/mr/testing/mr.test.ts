import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { makeMrModule } from "../module-port.js";
import type { MrHost, MrRequest } from "../module-port.js";

const detail = {
  description: "Original body",
  draft: true,
  head_pipeline: { id: 5, ref: "topic", sha: "a", status: "success" },
  iid: 9,
  sha: "b",
  source_branch: "topic",
  source_project_id: 7,
  state: "opened",
  target_branch: "main",
  target_project_id: 7,
  title: "Original",
  web_url: "https://gitlab.test/team/app/-/merge_requests/9",
};
const author = { bot: false, id: 2, name: "Reviewer" };
const inline = {
  id: "thread",
  individual_note: false,
  notes: [
    {
      author,
      body: "Fix this",
      id: 21,
      position: {
        new_line: null,
        new_path: "new.ts",
        old_line: 2,
        old_path: "old.ts",
      },
      resolvable: true,
      resolved: false,
    },
  ],
};
const general = {
  id: "general",
  individual_note: true,
  notes: [
    {
      author: { id: 4, name: "Robot" },
      body: "Overall",
      id: 22,
      resolvable: false,
    },
  ],
};
const ambiguous = [
  { head_sha: "b", iid: 9, url: detail.web_url },
  {
    head_sha: "b",
    iid: 10,
    url: "https://gitlab.test/team/app/-/merge_requests/10",
  },
];
const ok = (body: unknown) => Effect.succeed({ body, kind: "ok" } as const);
function setup(mode = "") {
  const calls: MrRequest[] = [];
  const context = {
    host: "gitlab.test",
    project_id: 7,
    repository: "team/app",
  };
  const availableMatches =
    mode === "ambiguous" ? ambiguous : ambiguous.slice(0, 1);
  const lookupMatches = mode === "absent" ? [] : availableMatches;
  let updated = false;
  const module = makeMrModule({
    authorize: () => Promise.resolve(mode !== "denied"),
    gitlab: {
      lookup_open_mrs: () =>
        Effect.succeed({
          context,
          data:
            mode === "lookup-failed"
              ? null
              : {
                  complete: true,
                  matches: lookupMatches,
                },
          error: null,
        }),
      repository: () =>
        Effect.succeed({
          context,
          data: { identity: { branch: "topic" } },
          error: null,
        }),
    },
    request: (_target, request) => {
      calls.push(request);
      switch (request.kind) {
        case "mr": {
          return ok({ ...detail, ...(updated ? { title: "New" } : {}) });
        }
        case "mrDiscussions": {
          const hasFollowingPage = mode === "pages" && request.page === 1;
          const rows = hasFollowingPage ? [general] : [general, inline];
          const next = hasFollowingPage ? "2" : "";
          return Effect.succeed({
            body: request.page === 2 ? [inline] : rows,
            kind: "ok",
            pagination: {
              linkNext: null,
              next: mode === "missing-page" ? null : next,
              page: String(request.page),
              perPage: String(request.pageSize),
            },
          });
        }
        case "mrDiscussion": {
          return ok(
            request.threadId === "general" || mode === "wrong"
              ? general
              : inline
          );
        }
        case "mrReply": {
          return mode === "lost"
            ? Effect.succeed({
                code: "REMOTE_STATE_UNKNOWN",
                delivery: "unknown",
                kind: "error",
                message: "unknown",
              })
            : ok({ id: 91 });
        }
        case "mrResolve": {
          return mode === "failed-resolve"
            ? Effect.succeed({
                code: "FORBIDDEN",
                delivery: "rejected",
                kind: "error",
                message: "rejected",
              })
            : ok({
                ...inline,
                notes: [{ ...inline.notes[0], resolved: true }],
              });
        }
        case "mrUpdate": {
          updated = true;
          return ok({ ...detail, title: "New" });
        }
        case "mrBranch":
        case "mrCreate": {
          throw new Error("Unexpected shipping-only MR request");
        }
        default: {
          const exhaustive: never = request;
          return exhaustive;
        }
      }
    },
  } satisfies MrHost);
  return { calls, module };
}

contractTest("mr.status", async () => {
  const { module, calls } = setup();
  await expect(Effect.runPromise(module.status({}))).resolves.toMatchObject({
    data: {
      merge_request: { head_sha: "b", iid: 9 },
      pipeline: { sha: "a", state: "success" },
      pipeline_matches_head: false,
      review_complete: true,
      unresolved_count: 1,
    },
    status: "ok",
  });
  expect(calls.map(({ kind }) => kind)).toStrictEqual(["mr", "mrDiscussions"]);
  await expect(
    Effect.runPromise(setup("missing-page").module.status({ iid: 9 }))
  ).resolves.toMatchObject({
    data: { review_complete: false, unresolved_count: null },
  });
});

contractTest("mr.selection", async () => {
  const absent = setup("absent");
  await expect(
    Effect.runPromise(absent.module.status({}))
  ).resolves.toMatchObject({
    data: { merge_request: null, selection: "absent" },
    status: "ok",
  });
  expect(absent.calls).toHaveLength(0);
  for (const [mode, code] of [
    ["ambiguous", "AMBIGUOUS_MR"],
    ["lookup-failed", "LOOKUP_FAILED"],
  ]) {
    const { module, calls } = setup(mode);
    await expect(Effect.runPromise(module.status({}))).resolves.toMatchObject({
      error: { code },
    });
    expect(calls).toHaveLength(0);
  }
});

contractTest("mr.threads", async () => {
  const { module } = setup("pages");
  const first = await Effect.runPromise(
    module.threads({ iid: 9, page_size: 2 })
  );
  expect(first).toMatchObject({
    data: {
      complete: false,
      threads: [
        {
          author_id: "4",
          body: "Overall",
          file: null,
          id: "general",
          is_bot: null,
          line: null,
          resolved: null,
        },
      ],
    },
    status: "ok",
  });
  const next = first.data?.next_cursor;
  expect(next).toBeTypeOf("string");
  await expect(
    Effect.runPromise(module.threads({ cursor: next, iid: 9, page_size: 2 }))
  ).resolves.toMatchObject({
    data: {
      complete: true,
      threads: [
        {
          file: "old.ts",
          id: "thread",
          is_bot: false,
          line: 2,
          resolvable: true,
          resolved: false,
        },
      ],
    },
    status: "ok",
  });
  await expect(
    Effect.runPromise(
      module.threads({
        cursor: next,
        iid: 9,
        include_resolved: false,
        page_size: 2,
      })
    )
  ).resolves.toMatchObject({ error: { code: "INVALID_CURSOR" } });
});

contractTest("mr.reply", async () => {
  const input = { body: "Addressed", iid: 9, thread_id: "thread" };
  const { module, calls } = setup();
  await expect(Effect.runPromise(module.reply(input))).resolves.toMatchObject({
    data: {
      observed_resolved: false,
      reply_id: "91",
      resolution_state: "not_requested",
    },
    status: "ok",
  });
  expect(calls.map(({ kind }) => kind)).toStrictEqual([
    "mr",
    "mrDiscussion",
    "mrReply",
  ]);
  expect(calls.at(-1)).toMatchObject({
    body: "Addressed",
    iid: 9,
    threadId: "thread",
  });
  const success = setup();
  await expect(
    Effect.runPromise(success.module.reply({ ...input, resolve: true }))
  ).resolves.toMatchObject({
    data: { observed_resolved: true, resolution_state: "resolved" },
    status: "ok",
  });
  expect(success.calls.map(({ kind }) => kind)).toStrictEqual([
    "mr",
    "mrDiscussion",
    "mrReply",
    "mrResolve",
  ]);
  for (const mode of ["wrong", "denied", "lost"]) {
    const started = setup(mode);
    const result = await Effect.runPromise(
      started.module.reply({ ...input, resolve: true })
    );
    expect(result.status).toBe(mode === "lost" ? "indeterminate" : "blocked");
    expect(started.calls.filter(({ kind }) => kind === "mrReply")).toHaveLength(
      mode === "lost" ? 1 : 0
    );
    expect(started.calls.some(({ kind }) => kind === "mrResolve")).toBeFalsy();
  }
});

contractTest("mr.partial", async () => {
  const { module, calls } = setup("failed-resolve");
  await expect(
    Effect.runPromise(
      module.reply({
        body: "Addressed",
        iid: 9,
        resolve: true,
        thread_id: "thread",
      })
    )
  ).resolves.toMatchObject({
    completed_effects: [
      { outcome: "committed", phase: "reply", reference: "91" },
    ],
    data: {
      reply_id: "91",
      reply_state: "committed",
      resolution_state: "failed",
    },
    status: "partial",
  });
  expect(calls.filter(({ kind }) => kind === "mrReply")).toHaveLength(1);
});

contractTest("mr.update", async () => {
  const { module, calls } = setup();
  await expect(
    Effect.runPromise(module.update({ iid: 9 }))
  ).resolves.toMatchObject({
    error: { code: "EMPTY_PATCH" },
  });
  await expect(
    Effect.runPromise(module.update({ iid: 9, title: "Original" }))
  ).resolves.toMatchObject({ data: { no_change: true }, status: "ok" });
  await expect(
    Effect.runPromise(module.update({ iid: 9, title: "New" }))
  ).resolves.toMatchObject({
    data: { changed_fields: ["title"], readback_complete: true },
    status: "ok",
  });
  expect(calls.filter(({ kind }) => kind === "mrUpdate")).toMatchObject([
    { patch: { title: "New" } },
  ]);
});
