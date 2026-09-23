import { expect, test } from "bun:test";
import { Effect } from "effect";

import { TaskPreflightService } from "./core";
import {
  type TaskPreflightCommandRequest,
  TaskPreflightLiveLayerWithTransport,
} from "./live";

test("searches worktrees, Jira tickets, and open merge requests", async () => {
  const requests: TaskPreflightCommandRequest[] = [];
  const result = await Effect.runPromise(
    TaskPreflightService.use((service) =>
      service.search({ cwd: "/repo", query: "CI-6861" }),
    ).pipe(
      Effect.provide(
        TaskPreflightLiveLayerWithTransport((request) => {
          requests.push(request);
          const command = `${request.program} ${request.arguments_.join(" ")}`;
          if (command === "git rev-parse --show-toplevel") {
            return Effect.succeed({ exitCode: 0, output: "/repo\n" });
          }
          if (command === "git worktree list --porcelain") {
            return Effect.succeed({
              exitCode: 0,
              output:
                "worktree /repo\nbranch refs/heads/main\n\nworktree /worktrees/campaign-filter\nbranch refs/heads/feat/campaign-filter/CI-6861\n",
            });
          }
          if (request.program === "jira") {
            return Effect.succeed({
              exitCode: 0,
              output: JSON.stringify([
                {
                  key: "CI-6861",
                  fields: { summary: "Add campaign filter" },
                },
              ]),
            });
          }
          return Effect.succeed({
            exitCode: 0,
            output: JSON.stringify([
              {
                iid: 1309,
                title: "feat: add campaign filter [CI-6861]",
                source_branch: "CI-6861",
              },
            ]),
          });
        }),
      ),
    ),
  );

  expect(requests).toHaveLength(4);
  expect(result).toEqual({
    worktrees: [
      {
        path: "/worktrees/campaign-filter",
        branch: "feat/campaign-filter/CI-6861",
      },
    ],
    tickets: [{ key: "CI-6861", summary: "Add campaign filter" }],
    mergeRequests: [
      {
        iid: 1309,
        title: "feat: add campaign filter [CI-6861]",
        sourceBranch: "CI-6861",
      },
    ],
  });
});

test("fails closed with the command and directory when lookup cannot run", async () => {
  const failure = await Effect.runPromise(
    TaskPreflightService.use((service) =>
      Effect.flip(service.search({ cwd: "/repo", query: "CI-6861" })),
    ).pipe(
      Effect.provide(
        TaskPreflightLiveLayerWithTransport(() =>
          Effect.fail(new Error("spawn ENOENT")),
        ),
      ),
    ),
  );

  expect(failure.message).toContain("git rev-parse --show-toplevel");
  expect(failure.message).toContain("/repo");
});
