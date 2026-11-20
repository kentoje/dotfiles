import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { makeJiraModule } from "../module-port.js";
import type { JiraHost, JiraRequest } from "../module-port.js";

const issue = {
  fields: {
    project: { key: "APP" },
    status: { name: "Open" },
    summary: "Existing",
  },
  id: "42",
  key: "APP-1",
};
const create = {
  fields: { Sprint: 1 },
  issue_type: "Bug",
  project: "APP",
  summary: "Existing",
};
const sprint = {
  fieldId: "customfield_1",
  name: "Sprint",
  required: true,
  schema: { type: "number" },
};
const ok = (data: unknown) => Promise.resolve({ data, kind: "ok" } as const);
function jiraFixtureIssues(
  mode: string | undefined,
  scans: number,
  token: string | null
) {
  if (mode === "large" || mode === "unbounded") {
    const page = Number(token ?? 0) + 1;
    if (page === 21 && mode === "large") {
      return ok({ isLast: true, issues: [issue] });
    }
    return ok({ isLast: false, issues: [], nextPageToken: String(page) });
  }
  if (mode === "incomplete") {
    return ok({ issues: [] });
  }
  if (mode === "match" || mode === "changed") {
    return ok({
      isLast: true,
      issues: [
        scans === 1 || mode === "match"
          ? issue
          : {
              ...issue,
              fields: { ...issue.fields, status: { name: "Closed" } },
            },
      ],
    });
  }
  if (!token && mode === "pages") {
    return ok({
      isLast: false,
      issues: [issue],
      nextPageToken: "next-token",
    });
  }
  return ok({ isLast: true, issues: [] });
}
function setup(options: { mode?: string; authorize?: boolean } = {}) {
  const calls: JiraRequest[] = [];
  let scans = 0;
  let writes = 0;
  const request: JiraHost["request"] = (r) => {
    calls.push(r);
    switch (r.route) {
      case "issue": {
        return options.mode === "lookup" ||
          (writes > 0 && options.mode === "readback")
          ? Promise.resolve({ kind: "rejected", status: 404 })
          : ok(options.mode === "wrong" ? { ...issue, key: "APP-9" } : issue);
      }
      case "search": {
        scans += 1;
        return jiraFixtureIssues(
          options.mode,
          scans,
          r.query.get("nextPageToken")
        );
      }
      case "types": {
        return ok({
          issueTypes: [{ id: "10", name: "Bug" }],
          startAt: 0,
          total: 1,
        });
      }
      case "create-fields": {
        return ok({ fields: [sprint], startAt: 0, total: 1 });
      }
      case "edit-fields": {
        return ok({
          fields: {
            a: { name: "Ambiguous" },
            b: { name: "Ambiguous" },
            summary: { name: "Summary", schema: { type: "string" } },
          },
        });
      }
      case "transitions": {
        return ok({
          transitions: [
            {
              fields: { resolution: { name: "Resolution", required: true } },
              id: "5",
              name: "Close",
            },
            { fields: {}, id: "6", name: "Close" },
          ],
        });
      }
      default: {
        writes += 1;
        if (options.mode === "unknown") {
          return Promise.resolve({ kind: "unknown" });
        }
        if (options.mode === "rejected") {
          return Promise.resolve({ kind: "rejected", status: 409 });
        }
        const data = {
          comment: { id: "78" },
          create: { id: "42", key: "APP-1" },
          transition: null,
          update: null,
        };
        return ok(data[r.route]);
      }
    }
  };
  const confirmations: Parameters<NonNullable<JiraHost["confirm"]>>[0][] = [];
  return {
    calls,
    confirmations,
    jira: makeJiraModule({
      confirm: (target) => {
        confirmations.push(target);
        return Promise.resolve(options.authorize ?? true);
      },
      request,
      site: "https://jira.test",
    }),
    writes: () => writes,
  };
}

contractTest("jira.reads", async () => {
  const { jira, calls } = setup();
  await expect(
    Effect.runPromise(jira.get({ fields: ["customfield_1"], key: "APP-1" }))
  ).resolves.toMatchObject({ data: { id: "42", key: "APP-1" }, status: "ok" });
  await expect(
    Effect.runPromise(jira.get({ key: "APP-1", site: "https://wrong.test" }))
  ).resolves.toMatchObject({ status: "blocked" });
  expect(calls).toHaveLength(1);
  for (const mode of ["wrong", "lookup"]) {
    await expect(
      Effect.runPromise(setup({ mode }).jira.get({ key: "APP-1" }))
    ).resolves.toMatchObject({ data: null, status: "error" });
  }
  await expect(
    Effect.runPromise(
      setup({ mode: "incomplete" }).jira.search({ query: "project = APP" })
    )
  ).resolves.toMatchObject({ data: null, status: "error" });
});

contractTest("jira.search", async () => {
  const { jira, calls } = setup({ mode: "pages" });
  const params = {
    page_size: 1,
    project: "APP",
    query: 'text ~ "ORDER BY" OR priority = High ORDER BY created DESC',
  };
  const first = await Effect.runPromise(jira.search(params));
  expect(first).toMatchObject({
    data: { complete: false, has_more: true, issues: [{ key: "APP-1" }] },
    status: "ok",
  });
  const [route] = calls;
  expect(route?.route === "search" && route.query.get("jql")).toBe(
    'project = "APP" AND (text ~ "ORDER BY" OR priority = High) ORDER BY created DESC'
  );
  const cursor = first.data?.next_cursor;
  expect(cursor).toBeTypeOf("string");
  await expect(
    Effect.runPromise(jira.search({ ...params, cursor }))
  ).resolves.toMatchObject({
    data: { complete: true, has_more: false, issues: [] },
    status: "ok",
  });
  await expect(
    Effect.runPromise(jira.search({ ...params, cursor, project: "OTHER" }))
  ).resolves.toMatchObject({
    error: { code: "INVALID_CURSOR" },
    status: "error",
  });
  expect(calls).toHaveLength(2);
});

contractTest("jira.metadata", async () => {
  const { jira, writes } = setup();
  for (const [fields, code] of [
    [{}, "FIELD_REQUIRED"],
    [{ Sprint: "abc" }, "FIELD_UNSUPPORTED"],
    [{ project: { key: "Y" } }, "FIELD_UNSUPPORTED"],
  ] as const) {
    await expect(
      Effect.runPromise(jira.create({ ...create, fields }))
    ).resolves.toMatchObject({ error: { code } });
  }
  await expect(
    Effect.runPromise(jira.update({ fields: { Ambiguous: 1 }, key: "APP-1" }))
  ).resolves.toMatchObject({ error: { code: "FIELD_AMBIGUOUS" } });
  expect(writes()).toBe(0);
  await expect(Effect.runPromise(jira.create(create))).resolves.toMatchObject({
    data: { id: "42", key: "APP-1" },
    status: "ok",
  });
});

contractTest("jira.duplicates", async () => {
  const denied = setup({ authorize: false, mode: "match" });
  await expect(
    Effect.runPromise(denied.jira.create(create))
  ).resolves.toMatchObject({
    status: "blocked",
  });
  expect(denied.writes()).toBe(0);
  expect(denied.confirmations[0]).toMatchObject({
    duplicate: { matches: [{ key: "APP-1", state: "Open" }] },
    project: "APP",
  });
  const changed = setup({ mode: "changed" });
  await expect(
    Effect.runPromise(changed.jira.create(create))
  ).resolves.toMatchObject({
    error: { code: "DUPLICATE_DECISION_REQUIRED" },
    status: "blocked",
  });
  expect(changed.writes()).toBe(0);
  const incomplete = setup({ mode: "incomplete" });
  await expect(
    Effect.runPromise(incomplete.jira.create(create))
  ).resolves.toMatchObject({ status: "blocked" });
  expect(incomplete.writes()).toBe(0);
  const approved = setup({ mode: "match" });
  await expect(
    Effect.runPromise(approved.jira.create(create))
  ).resolves.toMatchObject({
    status: "ok",
  });
  expect(approved.calls.filter((r) => r.route === "search")).toHaveLength(2);
  expect(approved.writes()).toBe(1);
});

contractTest("jira.large-duplicate-scan", async () => {
  const large = setup({ mode: "large" });
  await expect(
    Effect.runPromise(large.jira.create(create))
  ).resolves.toMatchObject({
    status: "ok",
  });
  expect(large.confirmations[0]).toMatchObject({
    duplicate: { matches: [{ key: "APP-1", state: "Open" }] },
  });
  expect(
    large.calls.filter((request) => request.route === "search")
  ).toHaveLength(42);
  expect(large.writes()).toBe(1);

  const unbounded = setup({ mode: "unbounded" });
  await expect(
    Effect.runPromise(unbounded.jira.create(create))
  ).resolves.toMatchObject({
    error: { code: "SEARCH_INCOMPLETE" },
    status: "blocked",
  });
  expect(unbounded.confirmations).toHaveLength(0);
  expect(unbounded.writes()).toBe(0);
});

contractTest("jira.authorization", async () => {
  const denied = setup({ authorize: false });
  await expect(
    Effect.runPromise(
      denied.jira.update({ fields: { Summary: "New" }, key: "APP-1" })
    )
  ).resolves.toMatchObject({ status: "blocked" });
  expect(denied.confirmations).toMatchObject([
    {
      key: "APP-1",
      payload: { fields: { summary: "New" } },
      site: "https://jira.test",
    },
  ]);
  expect(denied.writes()).toBe(0);
  const stopped = AbortSignal.abort();
  await expect(
    Effect.runPromise(
      denied.jira.comment(
        { body: "Message", key: "APP-1" },
        { signal: stopped }
      )
    )
  ).resolves.toMatchObject({ status: "cancelled" });
  expect(denied.writes()).toBe(0);
});

contractTest("jira.update", async () => {
  const { jira, calls } = setup();
  await expect(
    Effect.runPromise(jira.update({ fields: {}, key: "APP-1" }))
  ).resolves.toMatchObject({ error: { code: "EMPTY_PATCH" } });
  await expect(
    Effect.runPromise(jira.update({ fields: { Summary: "New" }, key: "APP-1" }))
  ).resolves.toMatchObject({
    data: { changed_fields: ["summary"], readback_complete: true },
    status: "ok",
  });
  expect(calls.find((r) => r.route === "update")).toMatchObject({
    body: { fields: { summary: "New" } },
    key: "APP-1",
  });
});

contractTest("jira.comment", async () => {
  const { jira, calls } = setup();
  const body = "First line\n\nLast line";
  await expect(
    Effect.runPromise(jira.comment({ body, key: "APP-1" }))
  ).resolves.toMatchObject({
    data: { body, comment_id: "78", key: "APP-1" },
    status: "ok",
  });
  expect(calls.find((r) => r.route === "comment")).toMatchObject({
    body: {
      body: {
        content: [
          {
            content: [{ text: "First line", type: "text" }],
            type: "paragraph",
          },
          { type: "paragraph" },
          { content: [{ text: "Last line", type: "text" }], type: "paragraph" },
        ],
        type: "doc",
        version: 1,
      },
    },
    key: "APP-1",
  });
  const lost = setup({ mode: "unknown" });
  await expect(
    Effect.runPromise(lost.jira.comment({ body, key: "APP-1" }))
  ).resolves.toMatchObject({
    completed_effects: [{ outcome: "unknown" }],
    status: "indeterminate",
  });
  expect(lost.writes()).toBe(1);
});

contractTest("jira.transition", async () => {
  const { jira, writes } = setup();
  await expect(
    Effect.runPromise(jira.transition({ key: "APP-1", transition: "Close" }))
  ).resolves.toMatchObject({
    error: {
      code: "TRANSITION_AMBIGUOUS",
      details: { choices: [{ id: "5" }, { id: "6" }] },
    },
  });
  await expect(
    Effect.runPromise(jira.transition({ key: "APP-1", transition: "5" }))
  ).resolves.toMatchObject({ error: { code: "FIELD_REQUIRED" } });
  expect(writes()).toBe(0);
  await expect(
    Effect.runPromise(jira.transition({ key: "APP-1", transition: "6" }))
  ).resolves.toMatchObject({ data: { transition_id: "6" }, status: "ok" });
});

contractTest("jira.outcomes", async () => {
  const partial = setup({ mode: "readback" });
  await expect(
    Effect.runPromise(
      partial.jira.update({ fields: { Summary: "New" }, key: "APP-1" })
    )
  ).resolves.toMatchObject({
    completed_effects: [{ outcome: "committed" }],
    context: {
      changed_fields: ["summary"],
      key: "APP-1",
      readback_complete: false,
    },
    status: "partial",
  });
  expect(partial.writes()).toBe(1);
  const rejected = setup({ mode: "rejected" });
  await expect(
    Effect.runPromise(
      rejected.jira.transition({ key: "APP-1", transition: "6" })
    )
  ).resolves.toMatchObject({
    completed_effects: [],
    error: { code: "STATE_CONFLICT" },
    status: "error",
  });
  const lost = setup({ mode: "unknown" });
  await expect(
    Effect.runPromise(lost.jira.create(create))
  ).resolves.toMatchObject({
    status: "indeterminate",
  });
  expect(lost.writes()).toBe(1);
});
