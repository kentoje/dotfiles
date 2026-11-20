import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { contractTest } from "@covenant/vitest";
import { expect } from "vitest";

import { installPiFixtures } from "../testing/fixture.js";
import { loadMrDeliveryPolicy, readMrBranchEvidence } from "./policy.js";

const fixture = installPiFixtures();
contractTest("mr-guard.git-evidence", async () => {
  const f = await fixture();
  const repository = "https://gitlab.example/team/app";
  f.git(["remote", "add", "origin", repository]);
  f.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  f.git(["switch", "-c", "topic"]);
  await writeFile(join(f.repo, "changeset.md"), "release note");
  f.git(["add", "changeset.md"]);
  f.git([
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "feat: checked",
  ]);
  f.git(["update-ref", "refs/remotes/origin/topic", "HEAD"]);
  await writeFile(join(f.repo, "untracked.md"), "ignored");
  const policy = join(f.temp, "mr-policy.json");
  await writeFile(
    policy,
    JSON.stringify({
      [repository]: {
        changedPathPrefix: "changeset.md",
        commitSubjectPattern: "^feat:",
        titlePrefix: "feat: ",
      },
    })
  );
  await expect(loadMrDeliveryPolicy(policy, repository)).resolves.toMatchObject(
    { titlePrefix: "feat: " }
  );
  await expect(
    loadMrDeliveryPolicy(policy, "https://gitlab.example/team/other")
  ).resolves.toBeUndefined();
  await expect(
    readMrBranchEvidence(
      {
        repository,
        source_branch: "topic",
        target_branch: "main",
        title: "feat: checked",
      },
      { cwd: f.repo, gitlabHost: "gitlab.example" }
    )
  ).resolves.toStrictEqual({
    changed_paths: ["changeset.md"],
    commit_subjects: ["feat: checked"],
  });
});
