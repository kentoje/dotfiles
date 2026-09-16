import { expect, test } from "bun:test";
import { Effect } from "effect";
import type { RepositoryFleetEntry } from "../repo-map/core";
import { FleetGitLabService, FleetServiceError } from "./core";
import {
  type FleetCommandRequest,
  FleetLiveLayer,
  openFleetMergeRequest,
  readFleetGitStatus,
} from "./live";

const repository = {
  name: "example",
  path: "/tmp/fleet-contract/example",
} satisfies RepositoryFleetEntry;

test("Fleet Git status resolves the selected repository default branch", async () => {
  const requests: FleetCommandRequest[] = [];
  const status = await Effect.runPromise(
    readFleetGitStatus(repository, (request) => {
      requests.push(request);
      const command = request.arguments_.join(" ");
      if (command === "branch --show-current") {
        return Effect.succeed({ exitCode: 0, output: "feature/contract\n" });
      }
      if (command === "status --porcelain") {
        return Effect.succeed({ exitCode: 0, output: "" });
      }
      if (command === "symbolic-ref --quiet refs/remotes/origin/HEAD") {
        return Effect.succeed({
          exitCode: 0,
          output: "refs/remotes/origin/master\n",
        });
      }
      if (command === "rev-list --left-right --count origin/master...HEAD --") {
        return Effect.succeed({ exitCode: 0, output: "0\t2\n" });
      }
      return Effect.fail(
        new FleetServiceError({ message: `Unexpected command: ${command}` }),
      );
    }),
  );

  expect(status).toEqual({
    branch: "feature/contract",
    dirty: false,
    ahead: 2,
    behind: 0,
  });
  expect(requests.every(({ cwd }) => cwd === repository.path)).toBe(true);
  expect(requests.map(({ arguments_ }) => arguments_)).toContainEqual([
    "rev-list",
    "--left-right",
    "--count",
    "origin/master...HEAD",
    "--",
  ]);
});

test("open MR lookup omits the unsupported glab state flag", async () => {
  const requests: FleetCommandRequest[] = [];
  const mergeRequest = await Effect.runPromise(
    openFleetMergeRequest(
      { repository, branch: "feature/contract" },
      (request) => {
        requests.push(request);
        return Effect.succeed({
          exitCode: 0,
          output: JSON.stringify([
            { iid: 42, state: "opened", title: "Contract MR" },
          ]),
        });
      },
    ),
  );

  expect(requests).toEqual([
    {
      program: "glab",
      arguments_: [
        "mr",
        "list",
        "--source-branch",
        "feature/contract",
        "--output",
        "json",
      ],
      cwd: repository.path,
    },
  ]);
  expect(mergeRequest).toMatchObject({ iid: 42, state: "opened" });
});

test("open MR lookup returns an actionable typed glab compatibility failure", async () => {
  const exit = await Effect.runPromiseExit(
    openFleetMergeRequest({ repository, branch: "feature/contract" }, () =>
      Effect.succeed({
        exitCode: 1,
        output: "ERROR\nUnknown flag: --output.",
      }),
    ),
  );

  expect(exit._tag).toBe("Failure");
  expect(String(exit)).toContain(FleetServiceError.name);
  expect(String(exit)).toContain("Fleet open merge request lookup");
  expect(String(exit)).toContain("Unknown flag: --output");
});

test("Fleet live layer exposes the supported open MR lookup", async () => {
  const service = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* FleetGitLabService;
    }).pipe(Effect.provide(FleetLiveLayer)),
  );

  expect(service.openMergeRequestFor).toBeDefined();
});
