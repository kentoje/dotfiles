import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { makeMrCreationGuard, parseDirectMrCreation } from "../module-port.js";

const initial = {
  cwd: "checkout",
  repository: "https://gitlab.test/team/app",
  source_branch: "topic",
  target_branch: "main",
  title: "Implement change",
};
const found = {
  head_sha: "a",
  iid: 5,
  source_branch: "topic",
  target_branch: "main",
};
const context = { host: "gitlab.test", project_id: 7, repository: "team/app" };

contractTest("mr-guard.decision", async () => {
  for (const [kind, decision] of [
    ["none", "allow"],
    ["one", "reuse_existing"],
    ["many", "blocked"],
    ["failed", "blocked"],
    ["other-target", "blocked"],
  ]) {
    const checked: string[] = [];
    const guard = makeMrCreationGuard({
      status: (selection, branch) => {
        checked.push(selection.cwd ?? "", selection.repository ?? "", branch);
        const existing = {
          merge_request: {
            ...found,
            target_branch: kind === "one" ? "main" : "release",
          },
          selection: "found",
        };
        const foundMr =
          kind === "one" || kind === "other-target" ? existing : null;
        const data =
          kind === "none"
            ? { merge_request: null, selection: "absent" }
            : foundMr;
        return Promise.resolve({
          context,
          data,
          error:
            kind === "many"
              ? {
                  code: "AMBIGUOUS_MR",
                  details: { candidates: [found, { ...found, iid: 6 }] },
                }
              : null,
          status: data ? "ok" : "blocked",
        });
      },
    });
    const result = await guard.check_creation(initial);
    expect(result.data.decision).toBe(decision);
    expect(result.completed_effects).toStrictEqual([]);
    expect(checked).toStrictEqual([
      "checkout",
      "https://gitlab.test/team/app",
      "topic",
    ]);
    if (kind === "one") {
      expect(result.data.existing_mrs).toMatchObject([{ iid: 5 }]);
    }
    if (kind === "many") {
      expect(result.data.existing_mrs).toHaveLength(2);
    }
  }
});

contractTest("mr-guard.policy", async () => {
  const inspected: string[] = [];
  const guard = makeMrCreationGuard({
    branchEvidence: (request) => {
      inspected.push(request.source_branch, request.target_branch);
      return Promise.resolve({
        changed_paths: ["src/app"],
        commit_subjects: ["feat: update"],
      });
    },
    policy: (repository) =>
      repository === "https://gitlab.test/team/app"
        ? {
            changedPathPrefix: ".changeset/",
            commitSubjectPattern: "^feat:",
            titlePrefix: "feat: ",
          }
        : undefined,
    status: () =>
      Promise.resolve({
        context,
        data: { merge_request: null, selection: "absent" },
        error: null,
        status: "ok",
      }),
  });
  await expect(guard.check_creation(initial)).resolves.toMatchObject({
    data: { blockers: ["TITLE_POLICY_FAILED"], decision: "blocked" },
  });
  await expect(
    guard.check_creation({ ...initial, title: "feat: Implement change" })
  ).resolves.toMatchObject({
    data: { blockers: ["DELIVERY_REQUIREMENT_FAILED"], decision: "blocked" },
  });
  expect(inspected).toStrictEqual(["topic", "main"]);
});

contractTest("mr-guard.direct", () => {
  const command =
    'glab mr new -R https://gitlab.test/team/app -s topic -b main -t "Implement change" --draft';
  expect(
    parseDirectMrCreation(`cd "other checkout" && ${command}`)
  ).toStrictEqual({
    input: { ...initial, cwd: "other checkout" },
    kind: "checked",
  });
  expect(parseDirectMrCreation("git status")).toStrictEqual({ kind: "ignore" });
  for (const unsafe of [
    `${command} --auto-merge`,
    `${command}; git status`,
    `${command} --head elsewhere/repo`,
    command.replace("topic", "$BRANCH"),
    "glab mr create --fill",
  ]) {
    expect(parseDirectMrCreation(unsafe)).toMatchObject({ kind: "blocked" });
  }
});
