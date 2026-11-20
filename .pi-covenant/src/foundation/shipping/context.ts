import { lstat } from "node:fs/promises";
import { join } from "node:path";

import { Effect } from "effect";

import type { MrHost } from "../../mr/module-port.js";
import { resolveProjectContext } from "../../repository-context/module-port.js";
import { ShipFailureError } from "../../shipping/module-port.js";
import type {
  ShipInput,
  ShipInvocation,
  ShipScope,
  ShipTarget,
} from "../../shipping/module-port.js";
import { readShipBranch, runShipGit } from "./git.js";

const shipBranchPattern = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$/u;
export async function resolveShipTarget(
  input: ShipInput,
  invocation: ShipInvocation,
  cwd: string,
  gitlabHost: string,
  gitlab: MrHost["gitlab"]
) {
  const selector = {
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.repository ? { repository: input.repository } : {}),
  };
  const resolved = await resolveProjectContext(selector, {
    gitlab: { allowedHosts: [gitlabHost] },
    sessionCwd: cwd,
  });
  const git = resolved.data?.gitlab_target;
  const root = resolved.data?.worktree_root;
  if (!git?.remote_name || !root || !resolved.data || git.host !== gitlabHost) {
    throw new ShipFailureError(
      "CONTEXT_UNAVAILABLE",
      "Select a checkout with an unambiguous configured GitLab remote."
    );
  }
  const repository = `https://${git.host}/${git.project_path}`;
  // The GitLab module returns a richer repository report through the same underlying operation.
  const selected = await Effect.runPromise(
    gitlab.repository({ repository }, invocation)
  );
  const defaultBranch = selected.data?.default_branch;
  if (typeof defaultBranch !== "string" || !selected.context.project_id) {
    throw new ShipFailureError(
      "CONTEXT_UNAVAILABLE",
      "GitLab project identity or its default branch could not be verified."
    );
  }
  const { branch, head } = await readShipBranch(root, invocation);
  const targetBranch = input.target_branch ?? defaultBranch;
  if (
    !shipBranchPattern.test(branch) ||
    !shipBranchPattern.test(targetBranch)
  ) {
    throw new ShipFailureError(
      "DEFAULT_OR_DETACHED_BRANCH",
      "The task and target require supported named branches."
    );
  }
  const subject = await runShipGit(
    root,
    ["log", "-1", "--format=%s", head, "--"],
    invocation
  );
  const commitSubject = subject.trim();
  const title = (input.title ?? commitSubject).trim();
  if (!title || title.length > 240) {
    throw new ShipFailureError(
      "TITLE_POLICY_FAILED",
      "Supply a nonempty MR title of at most 240 characters."
    );
  }
  return {
    branch,
    cwd: root,
    defaultBranch,
    head,
    project: resolved.data.project_root,
    projectId: selected.context.project_id,
    remote: git.remote_name,
    repository,
    targetBranch,
    title,
  };
}

/** Compare the committed branch and authorized files against the selected remote-tracking base. */
export async function readShipDeliveryEvidence(
  target: ShipTarget,
  scope: ShipScope,
  input: ShipInput,
  pushed: boolean,
  invocation: ShipInvocation
) {
  const base = `refs/remotes/${target.remote}/${target.targetBranch}`;
  const git = (args: readonly string[]) =>
    runShipGit(target.cwd, args, invocation);
  const [mergeBase, subjects] = await Promise.all([
    git(["merge-base", base, target.head]),
    git([
      "log",
      "--no-decorate",
      "--no-notes",
      "--format=%s",
      `${base}..${target.head}`,
      "--",
    ]),
  ]);
  const common = mergeBase.trim();
  if (!/^[a-f0-9]{40,64}$/u.test(common)) {
    throw new ShipFailureError(
      "DELIVERY_REQUIREMENT_FAILED",
      "The selected base commit is unavailable."
    );
  }
  const diff = await git([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    "--diff-filter=AMR",
    "-z",
    common,
    target.head,
    "--",
  ]);
  const changed_paths = diff.split("\0").filter(Boolean);
  const commit_subjects = subjects.trimEnd().split("\n").filter(Boolean);
  if (!pushed && scope.hasChanges) {
    const stillPresent = await Promise.all(
      scope.paths.map(async (path) =>
        (await lstat(join(target.cwd, path)).catch(() => null)) ? path : null
      )
    );
    changed_paths.push(...stillPresent.filter((path) => path !== null));
    commit_subjects.push(
      (input.commit_message ?? input.title ?? target.title).split("\n")[0] ?? ""
    );
  }
  return { changed_paths, commit_subjects };
}
