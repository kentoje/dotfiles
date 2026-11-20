import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { makeFleetModule } from "../../fleet/module-port.js";
import { installPiFixtures } from "../testing/fixture.js";
import { readFleetStatus } from "./status.js";
import { readFleetVersions } from "./versions.js";

const fixture = installPiFixtures();
contractTest("fleet.status", async () => {
  const f = await fixture();
  f.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  f.git(["add", "package.json", "project-checks.json"]);
  f.git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-m",
    "Track files",
  ]);
  await f.write("package.json", { name: "dirty" });
  await f.write("loose.json", {});
  const before = f.git(["status", "--porcelain"]).toString();
  const head = f.git(["rev-parse", "HEAD"]).toString();
  const options = {
    comparisonRef: "refs/remotes/origin/main",
    id: "app",
    path: f.repo,
  };
  const result = await readFleetStatus(options, AbortSignal.timeout(5000), () =>
    Promise.reject(new Error("remote error"))
  );
  expect(result).toMatchObject({
    data: {
      ahead: 1,
      behind: 0,
      branch: "main",
      comparison_ref: options.comparisonRef,
      dirty_tracked: true,
      merge_requests: null,
      untracked_count: 1,
    },
    errors: [{ code: "REMOTE_LOOKUP_FAILED" }],
  });
  expect(f.git(["status", "--porcelain"]).toString()).toBe(before);
  expect(f.git(["rev-parse", "HEAD"]).toString()).toBe(head);
  await expect(
    readFleetStatus(
      { ...options, comparisonRef: "refs/remotes/origin/missing" },
      AbortSignal.timeout(5000)
    )
  ).resolves.toMatchObject({
    data: {
      ahead: null,
      behind: null,
      comparison_unavailable_reason: expect.any(String),
    },
  });
});
contractTest("fleet.versions", async () => {
  const f = await fixture();
  const malformed = await fixture();
  await f.write("package.json", { dependencies: { ui: "^2.3.0" } });
  await writeFile(
    join(f.repo, "pnpm-workspace.yaml"),
    "packages:\n  - packages/*\n  - '!packages/skip'\n"
  );
  await mkdir(join(f.repo, "packages/a"), { recursive: true });
  await mkdir(join(f.repo, "packages/skip"), { recursive: true });
  await f.write("packages/a/package.json", {
    peerDependencies: { ui: "workspace:*" },
  });
  await writeFile(join(f.repo, "packages/skip/package.json"), "{invalid");
  await writeFile(join(malformed.repo, "package.json"), "{invalid");
  const fleet = makeFleetModule({
    repositories: [
      { id: "app", path: f.repo },
      { id: "broken", path: malformed.repo },
    ],
    status: readFleetStatus,
    versions: readFleetVersions,
  });
  await expect(fleet.versions({ package: "ui" })).resolves.toMatchObject({
    data: {
      results: [
        {
          data: {
            declarations: [
              {
                manifest: "package.json",
                section: "dependencies",
                spec: "^2.3.0",
              },
              {
                manifest: "packages/a/package.json",
                section: "peerDependencies",
                spec: "workspace:*",
              },
            ],
            missing: false,
          },
          repository: "app",
          status: "ok",
        },
        {
          data: null,
          errors: [{ code: "MANIFEST_INVALID" }],
          repository: "broken",
          status: "error",
        },
      ],
    },
    status: "partial",
  });
  await expect(
    fleet.versions({ package: "missing", repositories: ["app"] })
  ).resolves.toMatchObject({
    data: { results: [{ data: { missing: true } }] },
    status: "ok",
  });
});
