import { expect, test } from "bun:test";
import { Effect, Option } from "effect";

import { GitLabService } from "./core";
import {
  type GitLabCommandRequest,
  type GitLabCommandResult,
  type GitLabCommandTransport,
  GitLabLiveLayerWithTransport,
} from "./live";

type TransportResponse =
  | {
      readonly kind: "success";
      readonly result: GitLabCommandResult;
    }
  | {
      readonly kind: "failure";
      readonly error: Error;
    };

const success = (output: string, exitCode = 0): TransportResponse => ({
  kind: "success",
  result: { exitCode, output },
});

const failure = (message: string): TransportResponse => ({
  kind: "failure",
  error: new Error(message),
});

const makeTransport = (
  responses: ReadonlyArray<TransportResponse>,
  requests: Array<GitLabCommandRequest>,
): GitLabCommandTransport => {
  let responseIndex = 0;

  return (request) => {
    requests.push(request);
    const response = responses[responseIndex];
    responseIndex += 1;

    if (response === undefined) {
      return Effect.fail(new Error("unexpected GitLab command"));
    }

    switch (response.kind) {
      case "success":
        return Effect.succeed(response.result);
      case "failure":
        return Effect.fail(response.error);
      default: {
        const exhaustiveResponse: never = response;
        return exhaustiveResponse;
      }
    }
  };
};

const findOpenMergeRequest = (transport: GitLabCommandTransport) =>
  Effect.runPromise(
    GitLabService.use((service) =>
      service.findOpenMergeRequestForCurrentBranch({ cwd: "/workspace" }),
    ).pipe(Effect.provide(GitLabLiveLayerWithTransport(transport))),
  );

test("returns an open merge request from the structured list payload", async () => {
  const requests: Array<GitLabCommandRequest> = [];
  const result = await findOpenMergeRequest(
    makeTransport(
      [success("feature/CI-1\n"), success('[{"iid":42}]')],
      requests,
    ),
  );

  expect(result).toEqual(Option.some({ iid: 42 }));
  expect(requests).toEqual([
    {
      cwd: "/workspace",
      program: "git",
      arguments_: ["branch", "--show-current"],
    },
    {
      cwd: "/workspace",
      program: "glab",
      arguments_: [
        "mr",
        "list",
        "--source-branch",
        "feature/CI-1",
        "--output",
        "json",
      ],
    },
  ]);
});

test("returns none when the structured merge request list is empty", async () => {
  const result = await findOpenMergeRequest(
    makeTransport([success("feature/CI-1\n"), success("[]")], []),
  );

  expect(result).toEqual(Option.none());
});

test("fails with a typed lookup error for malformed JSON", async () => {
  await expect(
    findOpenMergeRequest(
      makeTransport([success("feature/CI-1\n"), success("not JSON")], []),
    ),
  ).rejects.toMatchObject({
    _tag: "GitLabMergeRequestLookupError",
    message: expect.stringContaining("merge request list JSON is malformed"),
  });
});

test("fails with a typed lookup error for an unsupported payload", async () => {
  await expect(
    findOpenMergeRequest(
      makeTransport([success("feature/CI-1\n"), success('{"iid":42}')], []),
    ),
  ).rejects.toMatchObject({
    _tag: "GitLabMergeRequestLookupError",
    message: expect.stringContaining(
      "merge request list payload is unsupported",
    ),
  });
});

test("fails with a typed lookup error for a nonzero list exit", async () => {
  await expect(
    findOpenMergeRequest(
      makeTransport(
        [success("feature/CI-1\n"), success("permission denied", 2)],
        [],
      ),
    ),
  ).rejects.toMatchObject({
    _tag: "GitLabMergeRequestLookupError",
    message: "GitLab MR lookup failed: glab mr list exited with 2",
  });
});

test("fails with a typed lookup error when the transport fails", async () => {
  await expect(
    findOpenMergeRequest(makeTransport([failure("transport unavailable")], [])),
  ).rejects.toMatchObject({
    _tag: "GitLabMergeRequestLookupError",
    message: "GitLab MR lookup failed: transport unavailable",
  });
});
