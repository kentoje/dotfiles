import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import type { GitlabMutationTarget } from "../../gitlab/module-port.js";
import { makeGitlabModule } from "../../gitlab/module-port.js";
import { createGitlabReadTransport } from "../module-port.js";
import { installLoopbackHttpFixtures } from "../testing/http-fixture.js";
import { createGitlabMutationCoordinator } from "./coordination.js";

const fixture = installLoopbackHttpFixtures();
const repository = "https://gitlab.example/team/app";
const input = { pipeline_id: 42, repository };
const token = "fixture-secret-token";
const pipeline = {
  id: 42,
  project_id: 7,
  ref: "topic",
  sha: "commit-a",
  status: "running",
};
async function setup(mode = "") {
  const authority: GitlabMutationTarget[] = [];
  const post = Promise.withResolvers<boolean>();
  const finished = Promise.withResolvers<boolean>();
  let released = false;
  // oxlint-disable-next-line complexity -- One local server fixtures the supported REST routes and explicit failure modes.
  const f = await fixture((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = url.pathname;
    const json = (data: unknown) => res.end(JSON.stringify(data));
    if (route.endsWith("/team%2Fapp")) {
      return json({
        default_branch: null,
        id: 7,
        path_with_namespace: "team/app",
        web_url: repository,
      });
    }
    if (route.endsWith("/trace")) {
      res.write("Afixt");
      return res.end("ure-secret-tokenZ🙂");
    }
    if (req.method === "POST") {
      post.resolve(true);
      if (mode === "hang" && !released) {
        void finished.promise.then(() => json(pipeline));
        return;
      }
      if (mode === "bad-ack") {
        return json({ ...pipeline, id: 43 });
      }
      if (mode === "rate-limited") {
        res.statusCode = 429;
        res.setHeader("Retry-After", "0");
        return res.end("{}");
      }
      if (mode === "lost") {
        return req.socket.destroy();
      }
      if (mode === "redirect") {
        res.statusCode = 307;
        res.setHeader("Location", "/wrong");
        return res.end();
      }
      return json(pipeline);
    }
    if (route.endsWith("/42")) {
      return json(mode === "wrong" ? { ...pipeline, id: 43 } : pipeline);
    }
    if (route.endsWith("/jobs/8")) {
      return json({
        commit: { id: pipeline.sha },
        id: 8,
        name: "test",
        pipeline,
        status: "failed",
      });
    }
    const second = url.searchParams.get("page") === "2";
    if (mode !== "missing" && !(mode === "mr-failure" && second)) {
      res.setHeader(
        "x-next-page",
        second || route.endsWith("/jobs") ? "" : "2"
      );
    }
    if (route.endsWith("/merge_requests")) {
      return json(
        second
          ? [
              {
                iid: 9,
                sha: "commit-a",
                source_branch: "topic",
                source_project_id: 7,
                state: "opened",
                web_url: `${repository}/-/merge_requests/9`,
              },
            ]
          : []
      );
    }
    if (route.endsWith("/jobs")) {
      return json([
        {
          id: 8,
          name: "test",
          pipeline,
          retried: false,
          status: mode === "noop" ? "success" : "failed",
        },
      ]);
    }
    return json(second ? [] : [pipeline]);
  });
  const transport = createGitlabReadTransport({
    hosts: [
      {
        apiOrigin: f.origin,
        credential: () => Promise.resolve({ kind: "pat", token }),
        host: "gitlab.example",
      },
    ],
  });
  const module = makeGitlabModule({
    ...transport,
    acquireMutation: createGitlabMutationCoordinator(),
    authorizeMutation: (target) => {
      authority.push(target);
      return Effect.succeed(mode !== "denied");
    },
    selection: { allowedHosts: ["gitlab.example"] },
    sessionCwd: process.cwd(),
  });
  return {
    ...f,
    authority,
    finish: () => {
      released = true;
      finished.resolve(true);
    },
    module,
    post,
    transport,
  };
}

contractTest("gitlab.identities", async () => {
  const { module, requests } = await setup();
  expect((await Effect.runPromise(module.pipeline(input))).data).toMatchObject({
    id: 42,
    sha: "commit-a",
  });
  expect(
    (await Effect.runPromise(module.job({ job_id: 8, repository }))).data
  ).toMatchObject({ id: 8, pipeline_id: 42, sha: "commit-a" });
  expect(
    (await Effect.runPromise(module.jobs({ ...input, include_retried: true })))
      .data
  ).toMatchObject({ items: [{ id: 8, retried: false }] });
  expect(
    requests.some((r) => r.url?.includes("include_retried=true"))
  ).toBeTruthy();
  const wrong = await setup("wrong");
  expect(
    (await Effect.runPromise(wrong.module.pipeline(input))).error?.code
  ).toBe("TARGET_MISMATCH");
});
contractTest("gitlab.pagination", async () => {
  const { module, requests } = await setup();
  const first = await Effect.runPromise(
    module.pipelines({
      page_size: 1,
      ref: "topic",
      repository,
      sha: "commit-a",
      state: "running",
    })
  );
  expect(first.data).toMatchObject({ complete: false, has_more: true });
  const cursor = first.data?.next_cursor;
  expect(cursor).toBeTruthy();
  const callsBeforeInvalidCursor = requests.length;
  expect(
    (
      await Effect.runPromise(
        module.pipelines({ cursor, page_size: 1, ref: "different", repository })
      )
    ).error?.code
  ).toBe("INVALID_CURSOR");
  expect(requests).toHaveLength(callsBeforeInvalidCursor);
  expect(requests.filter((r) => r.url?.includes("/pipelines?"))).toHaveLength(
    1
  );
  const last = await Effect.runPromise(
    module.pipelines({
      cursor,
      page_size: 1,
      ref: "topic",
      repository,
      sha: "commit-a",
      state: "running",
    })
  );
  expect(last.data).toMatchObject({ complete: false, has_more: false });
  const missing = await setup("missing");
  expect(
    (await Effect.runPromise(missing.module.jobs(input))).error?.code
  ).toBe("INCOMPLETE_PAGINATION");
});
contractTest("gitlab.mr-lookup", async () => {
  const { module, requests } = await setup();
  expect(
    (
      await Effect.runPromise(
        module.lookup_open_mrs({ repository, source_branch: "topic" })
      )
    ).data
  ).toMatchObject({ complete: true, matches: [{ iid: 9 }] });
  expect(
    requests.filter((r) => r.url?.includes("/merge_requests?"))
  ).toHaveLength(2);
  const broken = await setup("mr-failure");
  expect(
    (
      await Effect.runPromise(
        broken.module.lookup_open_mrs({ repository, source_branch: "topic" })
      )
    ).status
  ).not.toBe("ok");
});
contractTest("gitlab.logs", async () => {
  const { module } = await setup();
  const result = await Effect.runPromise(
    module.logs({ job_id: 8, max_bytes: 7, offset: 3, repository })
  );
  expect(result.data).toMatchObject({
    has_more: true,
    next_offset: 10,
    redacted: true,
    source_bytes: 7,
    text: "*******",
  });
  expect(JSON.stringify(result)).not.toContain("xture-");
  const split = await Effect.runPromise(
    module.logs({
      job_id: 8,
      max_bytes: 1,
      offset: token.length + 2,
      repository,
    })
  );
  expect(split.data).toMatchObject({
    has_more: true,
    returned_bytes: 1,
    source_bytes: 1,
  });
  expect(split.warnings).toStrictEqual([
    expect.stringContaining("split UTF-8"),
  ]);
  const overflow = await Effect.runPromise(
    module.logs({
      job_id: 8,
      max_bytes: 1,
      offset: 16 * 1024 * 1024,
      repository,
    })
  );
  expect(overflow.error?.code).toBe("OUTPUT_LIMIT");
});

contractTest("gitlab.retry-target", async () => {
  const { module, requests } = await setup();
  expect((await Effect.runPromise(module.retry(input))).data).toMatchObject({
    pipeline: { id: 42, state: "running" },
    request_state: "accepted",
    retryable_jobs_observed: 1,
  });
  expect(
    requests.filter((r) => r.method === "POST").map((r) => r.url)
  ).toStrictEqual(["/api/v4/projects/7/pipelines/42/retry"]);
  const wrong = await setup("wrong");
  expect((await Effect.runPromise(wrong.module.retry(input))).error?.code).toBe(
    "TARGET_MISMATCH"
  );
  expect(wrong.requests.some((r) => r.method === "POST")).toBeFalsy();
});
contractTest("gitlab.cancel", async () => {
  const { module, requests } = await setup();
  const result = await Effect.runPromise(module.cancel(input));
  expect(result.data).toMatchObject({
    cancellation_confirmed: false,
    request_state: "accepted",
  });
  expect(result.completed_effects).toMatchObject([{ outcome: "committed" }]);
  expect(
    requests.filter((r) => r.method === "POST").map((r) => r.url)
  ).toStrictEqual(["/api/v4/projects/7/pipelines/42/cancel"]);
});
contractTest("gitlab.retry-no-change", async () => {
  const { module, requests } = await setup("noop");
  expect((await Effect.runPromise(module.retry(input))).data).toMatchObject({
    request_state: "no_change",
    retryable_jobs_observed: 0,
  });
  expect(requests.some((r) => r.method === "POST")).toBeFalsy();
  const missing = await setup("missing");
  expect(
    (await Effect.runPromise(missing.module.retry(input))).error?.code
  ).toBe("INCOMPLETE_PAGINATION");
  expect(missing.requests.some((r) => r.method === "POST")).toBeFalsy();
});
contractTest("gitlab.uncertain-write", async () => {
  for (const mode of ["lost", "redirect", "bad-ack"]) {
    const { module, requests } = await setup(mode);
    const result = await Effect.runPromise(module.retry(input));
    expect(result).toMatchObject({
      completed_effects: [{ outcome: "unknown" }],
      status: "indeterminate",
    });
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
    expect(requests.some((r) => r.url === "/wrong")).toBeFalsy();
  }
  const limited = await setup("rate-limited");
  await expect(
    Effect.runPromise(limited.module.cancel(input))
  ).resolves.toMatchObject({
    completed_effects: [],
    error: { code: "RATE_LIMITED" },
    status: "error",
  });
  expect(limited.requests.filter((req) => req.method === "POST")).toHaveLength(
    1
  );
});
contractTest("gitlab.cancellation", async () => {
  const { module, requests, post } = await setup("hang");
  const controller = new AbortController();
  controller.abort();
  expect(
    (
      await Effect.runPromise(
        module.cancel(input, { signal: controller.signal })
      )
    ).status
  ).toBe("cancelled");
  expect(requests).toHaveLength(0);
  const during = new AbortController();
  const pending = Effect.runPromise(
    module.cancel(input, { signal: during.signal })
  );
  await post.promise;
  during.abort();
  await expect(pending).resolves.toMatchObject({
    completed_effects: [{ outcome: "unknown" }],
    status: "indeterminate",
  });
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
});
contractTest("gitlab.authorization", async () => {
  const { module, requests, authority } = await setup("denied");
  expect(
    (await Effect.runPromise(module.retry({ ...input, approval: true }))).error
      ?.code
  ).toBe("INVALID_INPUT");
  expect(requests).toHaveLength(0);
  expect((await Effect.runPromise(module.retry(input))).error?.code).toBe(
    "AUTHORIZATION_REQUIRED"
  );
  expect(authority).toStrictEqual([
    {
      action: "retry",
      host: "gitlab.example",
      pipelineId: 42,
      projectId: 7,
      repository: "team/app",
    },
  ]);
  expect(requests.some((r) => r.method === "POST")).toBeFalsy();
});
contractTest("gitlab.coordination", async () => {
  const { module, requests, post, finish } = await setup("hang");
  const pending = Effect.runPromise(module.cancel(input));
  await post.promise;
  expect((await Effect.runPromise(module.retry(input))).error?.code).toBe(
    "WRITE_CONFLICT"
  );
  expect((await Effect.runPromise(module.pipeline(input))).status).toBe("ok");
  finish();
  expect((await pending).status).toBe("ok");
  const again = Effect.runPromise(module.cancel(input));
  expect((await again).status).toBe("ok");
  expect(requests.filter((r) => r.method === "POST")).toHaveLength(2);
});
contractTest("gitlab.forbidden-effects", async () => {
  const { transport, requests } = await setup();
  const target = {
    host: "gitlab.example",
    project_path: "team/app",
    remote_name: null,
    source: "fixture",
  };
  for (const kind of ["create", "delete", "play", "merge", "raw"]) {
    await expect(
      Effect.runPromise(
        transport.requestCi(target, { kind, pipelineId: 42, projectId: 7 })
      )
    ).resolves.toMatchObject({ code: "INVALID_INPUT" });
  }
  expect(requests).toHaveLength(0);
});
