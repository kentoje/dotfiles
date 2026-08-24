import { expect, test } from "bun:test";
import { Effect } from "effect";

import { GitChangesetLookupError } from "../git/core";
import { GitLabMergeRequestLookupError } from "../gitlab/core";
import { RepositoryFactsLookupError } from "../repo-map/core";
import { runHandler, runTool } from "./core";

test("runHandler returns successful handler values", async () => {
  const result = await runHandler(Effect.succeed({ kind: "allow" as const }));

  expect(result).toEqual({ kind: "allow" });
});

test("runHandler maps typed lookup failures to fail-closed reasons", async () => {
  const result = await runHandler(
    Effect.fail(
      new GitLabMergeRequestLookupError({
        message: "glab mr view exited with 1",
      }),
    ),
  );

  expect(result).toEqual({
    block: true,
    reason:
      "MR creation blocked: GitLab merge request verification failed. glab mr view exited with 1",
  });
});

test("runHandler maps defects to fail-closed reasons", async () => {
  const result = await runHandler(Effect.die("unexpected guard defect"));

  expect(result).toEqual({
    block: true,
    reason:
      "MR creation blocked: guard failed unexpectedly. unexpected guard defect",
  });
});

test("runHandler maps aborts to an actionable fail-closed reason", async () => {
  const controller = new AbortController();
  const resultPromise = runHandler(Effect.never, { signal: controller.signal });
  controller.abort();

  await expect(resultPromise).resolves.toEqual({
    block: true,
    reason:
      "MR creation blocked: guard verification was interrupted before it completed. Retry the command.",
  });
});

test("runTool maps typed failures through its tool-result factory", async () => {
  const result = await runTool(
    Effect.fail(
      new GitChangesetLookupError({
        message: "git diff failed",
      }),
    ),
    {
      failureResult: (reason) => ({
        content: [{ type: "text", text: reason }],
        details: { kind: "failure" },
      }),
    },
  );

  expect(result.content).toEqual([
    {
      type: "text",
      text: "MR creation blocked: Git changeset verification failed. git diff failed",
    },
  ]);
  expect(result.details).toEqual({ kind: "failure" });
});

test("runTool uses an operation prefix while preserving typed failure details", async () => {
  const result = await runTool(
    Effect.fail(
      new GitChangesetLookupError({
        message: "verify command failed",
      }),
    ),
    {
      failurePrefix: "Verify",
      failureResult: (reason) => ({
        content: [{ type: "text", text: reason }],
        details: { kind: "failure" },
      }),
    },
  );

  expect(result.content).toEqual([
    {
      type: "text",
      text: "Verify: Git changeset verification failed. verify command failed",
    },
  ]);
});

test("runHandler maps repository delivery-policy failures separately", async () => {
  const result = await runHandler(
    Effect.fail(
      new RepositoryFactsLookupError({
        message: "package.json is invalid",
      }),
    ),
  );

  expect(result).toEqual({
    block: true,
    reason:
      "MR creation blocked: repository delivery policy verification failed. package.json is invalid",
  });
});
