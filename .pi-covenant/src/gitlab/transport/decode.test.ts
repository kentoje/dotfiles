import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { makeGitlabModule } from "../module-port.js";

contractTest("gitlab.read-only", async () => {
  let body: unknown = {
    default_branch: "develop",
    id: 7,
    path_with_namespace: "team/app",
    web_url: "https://gitlab.example/team/app",
  };
  const module = makeGitlabModule({
    readProject: () => Effect.succeed({ body, kind: "ok" }),
    selection: { allowedHosts: ["gitlab.example"] },
    sessionCwd: process.cwd(),
  });
  const input = { repository: "https://gitlab.example/team/app" };
  expect(
    (await Effect.runPromise(module.repository(input))).data
  ).toMatchObject({ default_branch: "develop" });
  body = {
    default_branch: "develop",
    id: 7,
    path_with_namespace: "team/app",
    web_url: "https://gitlab.example/another/project",
  };
  expect((await Effect.runPromise(module.repository(input))).error?.code).toBe(
    "MALFORMED_RESPONSE"
  );
  body = {
    default_branch: "main",
    id: 7,
    path_with_namespace: "wrong/project",
    web_url: "https://gitlab.example/wrong/project",
  };
  expect((await Effect.runPromise(module.repository(input))).error?.code).toBe(
    "TARGET_MISMATCH"
  );
  body = { id: 7, path_with_namespace: "team/app" };
  expect((await Effect.runPromise(module.repository(input))).status).not.toBe(
    "ok"
  );
  expect(Object.keys(module)).toStrictEqual(["repository"]);
});
