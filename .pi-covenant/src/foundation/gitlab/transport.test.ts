import { setTimeout as wait } from "node:timers/promises";
import { gzipSync } from "node:zlib";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { makeGitlabModule } from "../../gitlab/module-port.js";
import { createGitlabReadTransport } from "../module-port.js";
import { installGitlabHttpFixtures } from "./http-fixture.js";

const fixture = installGitlabHttpFixtures();
const target = {
  host: "gitlab.example",
  project_path: "team/app",
  remote_name: null,
  source: "explicit",
};
contractTest("gitlab.credential-boundary", async () => {
  const token = "host-secret.fixture$*+token";
  const f = await fixture((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        default_branch: null,
        description: token,
        id: 7,
        nested: { [token]: token },
        path_with_namespace: "team/app",
        web_url: "https://gitlab.example/team/app",
      })
    );
  });
  for (const kind of ["pat", "oauth"] satisfies ("pat" | "oauth")[]) {
    const host = createGitlabReadTransport({
      hosts: [
        {
          apiOrigin: f.origin,
          credential: () => Promise.resolve({ kind, token }),
          host: target.host,
        },
      ],
    });
    const result = await Effect.runPromise(host.readProject(target, {}));
    expect(result.kind).toBe("ok");
    expect(JSON.stringify(result)).not.toContain(token);
  }
  expect(f.requests[0]?.privateToken).toBe(token);
  expect(f.requests[1]?.authorization).toBe(`Bearer ${token}`);
  expect(f.requests.every((req) => req.method === "GET")).toBeTruthy();
  expect(f.requests[0]?.url).toBe("/api/v4/projects/team%2Fapp");
  let credentialCalls = 0;
  const host = createGitlabReadTransport({
    hosts: [
      {
        apiOrigin: f.origin,
        credential: () => {
          credentialCalls += 1;
          return Promise.resolve({ kind: "pat", token });
        },
        host: target.host,
      },
    ],
  });
  expect(
    (
      await Effect.runPromise(
        host.readProject({ ...target, host: "other.example" }, {})
      )
    ).kind
  ).toBe("error");
  expect(
    (
      await Effect.runPromise(
        host.readProject({ ...target, method: "POST" }, {})
      )
    ).kind
  ).toBe("error");
  expect(credentialCalls).toBe(0);
  const reader = makeGitlabModule({
    readProject: host.readProject,
    selection: { allowedHosts: [target.host] },
    sessionCwd: process.cwd(),
  });
  const read = await Effect.runPromise(
    reader.repository({ repository: "https://gitlab.example/team/app" })
  );
  expect(read.status).toBe("ok");
  expect(JSON.stringify(read)).not.toContain(token);
  const late = Promise.withResolvers<unknown>();
  const before = f.requests.length;
  const slow = createGitlabReadTransport({
    hosts: [
      {
        apiOrigin: f.origin,
        credential: () => late.promise,
        host: target.host,
      },
    ],
    timeoutMs: 20,
  });
  await expect(
    Effect.runPromise(slow.readProject(target, {}))
  ).resolves.toMatchObject({ code: "DEADLINE_EXCEEDED", kind: "error" });
  late.resolve({ kind: "pat", token });
  await wait(5);
  expect(f.requests).toHaveLength(before);
});
contractTest("gitlab.transport-bounds", async () => {
  let count = 0;
  const f = await fixture((_req, res) => {
    count += 1;
    res.setHeader("content-type", "application/json");
    if (count === 1) {
      res.statusCode = 503;
      res.end("{}");
    } else {
      res.end('{"id":7}');
    }
  });
  const create = (
    origin: string,
    extra: { maxBytes?: number; timeoutMs?: number } = {}
  ) =>
    createGitlabReadTransport({
      hosts: [
        {
          apiOrigin: origin,
          credential: () =>
            Promise.resolve({
              kind: "pat",
              token: "transport-fixture-token",
            }),
          host: target.host,
        },
      ],
      ...extra,
    });
  expect(
    (await Effect.runPromise(create(f.origin).readProject(target, {}))).kind
  ).toBe("ok");
  expect(count).toBe(2);
  const always = await fixture((_req, res) => {
    res.statusCode = 503;
    res.end("{}");
  });
  expect(
    (await Effect.runPromise(create(always.origin).readProject(target, {})))
      .kind
  ).toBe("error");
  expect(always.requests).toHaveLength(2);
  for (const status of [401, 403, 404, 302, 307, 308]) {
    const error = await fixture((_req, res) => {
      res.statusCode = status;
      res.setHeader("location", f.origin);
      res.end("secret error body");
    });
    expect(
      (await Effect.runPromise(create(error.origin).readProject(target, {})))
        .kind
    ).toBe("error");
    expect(error.requests).toHaveLength(1);
  }
  const huge = await fixture((_req, res) => res.end("x".repeat(2048)));
  await expect(
    Effect.runPromise(
      create(huge.origin, { maxBytes: 128 }).readProject(target, {})
    )
  ).resolves.toMatchObject({ code: "OUTPUT_LIMIT", kind: "error" });
  const chunked = await fixture((_req, res) => {
    res.write("{");
    res.end("x".repeat(2048));
  });
  await expect(
    Effect.runPromise(
      create(chunked.origin, { maxBytes: 128 }).readProject(target, {})
    )
  ).resolves.toMatchObject({ code: "OUTPUT_LIMIT" });
  const compressed = await fixture((_req, res) => {
    res.setHeader("content-encoding", "gzip");
    res.end(gzipSync("x".repeat(2048)));
  });
  await expect(
    Effect.runPromise(
      create(compressed.origin, { maxBytes: 128 }).readProject(target, {})
    )
  ).resolves.toMatchObject({ code: "OUTPUT_LIMIT" });
  const broken = await fixture((_req, res) => res.end('{"id":'));
  await expect(
    Effect.runPromise(create(broken.origin).readProject(target, {}))
  ).resolves.toMatchObject({ code: "MALFORMED_RESPONSE", kind: "error" });
  const hanging = await fixture(() => {});
  await expect(
    Effect.runPromise(
      create(hanging.origin, { timeoutMs: 100 }).readProject(target, {})
    )
  ).resolves.toMatchObject({ code: "DEADLINE_EXCEEDED", kind: "error" });
  expect(hanging.requests).toHaveLength(1);
  const abort = new AbortController();
  abort.abort();
  await expect(
    Effect.runPromise(
      create(f.origin).readProject(target, { signal: abort.signal })
    )
  ).resolves.toMatchObject({ code: "CANCELLED", kind: "error" });
  await expect(
    Effect.runPromise(
      create(f.origin).readProject(target, { deadline: Date.now() - 1 })
    )
  ).resolves.toMatchObject({ code: "DEADLINE_EXCEEDED", kind: "error" });
  const seen = Promise.withResolvers<boolean>();
  const active = await fixture(() => seen.resolve(true));
  const during = new AbortController();
  const inFlight = Effect.runPromise(
    create(active.origin).readProject(target, { signal: during.signal })
  );
  await seen.promise;
  during.abort();
  await expect(inFlight).resolves.toMatchObject({ code: "CANCELLED" });
  expect(active.requests).toHaveLength(1);
});
