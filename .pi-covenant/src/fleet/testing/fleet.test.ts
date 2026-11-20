import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { makeFleetModule } from "../module-port.js";

contractTest("fleet.selection", async () => {
  const reads: string[] = [];
  const fleet = makeFleetModule({
    repositories: [
      { id: "first", path: "/a" },
      { id: "broken", path: "/b" },
    ],
    status(repo) {
      reads.push(repo.id);
      return Promise.resolve(
        repo.id === "first"
          ? {
              data: {
                ahead: null,
                behind: null,
                branch: "topic",
                comparison_ref: null,
                comparison_unavailable_reason: "unconfigured",
                dirty_tracked: false,
                head_sha: "abc",
                merge_requests: null,
                observed_at: "date",
                untracked_count: 0,
              },
              errors: [
                { code: "REMOTE_LOOKUP_FAILED", message: "Unavailable" },
              ],
            }
          : {
              data: null,
              errors: [{ code: "LOCAL_LOOKUP_FAILED", message: "Unavailable" }],
            }
      );
    },
    versions: () => Promise.reject(new Error("Unexpected lookup")),
  });
  expect(Object.keys(fleet).toSorted()).toStrictEqual(["status", "versions"]);
  await expect(
    fleet.status({ repositories: ["first", "unknown"] })
  ).resolves.toMatchObject({
    error: { code: "UNKNOWN_REPOSITORY" },
    status: "blocked",
  });
  expect(reads).toStrictEqual([]);
  await expect(
    fleet.status({ repositories: ["broken", "first", "broken"] })
  ).resolves.toMatchObject({
    data: {
      failed_count: 1,
      results: [
        { repository: "broken", status: "error" },
        { repository: "first", status: "partial" },
      ],
      selected_count: 2,
      succeeded_count: 1,
    },
    status: "partial",
  });
  expect(reads).toStrictEqual(["broken", "first"]);
  await expect(
    fleet.status({ repositories: ["broken"] })
  ).resolves.toMatchObject({ status: "error" });
});
