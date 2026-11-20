import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { Type } from "typebox";
import { Value } from "typebox/value";

import type {
  MrCreationInput,
  MrDeliveryPolicy,
} from "../../mr-guard/module-port.js";
import { resolveProjectContext } from "../../repository-context/module-port.js";

const policySchema = Type.Record(
  Type.String(),
  Type.Object(
    {
      changedPathPrefix: Type.Optional(
        Type.String({ maxLength: 255, minLength: 1 })
      ),
      commitSubjectPattern: Type.Optional(
        Type.String({ maxLength: 255, minLength: 1 })
      ),
      titlePrefix: Type.Optional(Type.String({ maxLength: 255, minLength: 1 })),
    },
    { additionalProperties: false }
  )
);
const executeGit = promisify(execFile);

/** Read the trusted file explicitly; a missing entry carries no repository policy. */
export async function loadMrDeliveryPolicy(
  path: string | undefined,
  repository: string
): Promise<MrDeliveryPolicy | undefined> {
  if (path === undefined) {
    return;
  }
  if (!isAbsolute(path)) {
    throw new Error("MR_POLICY_CONFIG: use an absolute host policy file.");
  }
  const info = await stat(path);
  if (!info.isFile() || info.size > 65_536) {
    throw new Error(
      "MR_POLICY_CONFIG: expected a regular file of at most 64 KiB."
    );
  }
  const raw: unknown = JSON.parse(await readFile(path, "utf-8"));
  if (!Value.Check(policySchema, raw)) {
    throw new Error("MR_POLICY_CONFIG: invalid repository policy map.");
  }
  return Object.hasOwn(raw, repository) ? raw[repository] : undefined;
}

/** Inspect committed remote-tracking refs in the exact selected checkout using fixed read-only Git commands. */
export async function readMrBranchEvidence(
  input: MrCreationInput,
  host: { cwd: string; gitlabHost: string },
  signal?: AbortSignal
) {
  const { cwd, repository, source_branch, target_branch } = input;
  const resolved = await resolveProjectContext(
    { ...(cwd ? { cwd } : {}), ...(repository ? { repository } : {}) },
    { gitlab: { allowedHosts: [host.gitlabHost] }, sessionCwd: host.cwd }
  );
  const worktree = resolved.data?.worktree_root;
  const remote = resolved.data?.gitlab_target?.remote_name;
  if (!worktree || !remote) {
    throw new Error(
      "MR_BRANCH_EVIDENCE: selected checkout has no matching Git remote."
    );
  }
  const options = {
    cwd: worktree,
    maxBuffer: 262_144,
    timeout: 5000,
    ...(signal ? { signal } : {}),
  };
  const run = async (args: string[]) => {
    const { stdout } = await executeGit(
      "git",
      ["--no-optional-locks", "--no-pager", ...args],
      options
    );
    return stdout;
  };
  const head = `refs/remotes/${remote}/${source_branch}`;
  const target = `refs/remotes/${remote}/${target_branch}`;
  const [{ stdout: baseResult }, log] = await Promise.all([
    executeGit(
      "git",
      ["--no-optional-locks", "merge-base", target, head],
      options
    ),
    run([
      "log",
      "--no-decorate",
      "--no-notes",
      "--format=%s",
      `${target}..${head}`,
      "--",
    ]),
  ]);
  const base = baseResult.trim();
  if (!/^[a-f0-9]{40,64}$/u.test(base)) {
    throw new Error(
      "MR_BRANCH_EVIDENCE: Git did not return a valid merge base."
    );
  }
  const changed = await run([
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
    "--diff-filter=AMR",
    "-z",
    base,
    head,
    "--",
  ]);
  return {
    changed_paths: changed.split("\0").filter(Boolean),
    commit_subjects: log.trimEnd().split("\n").filter(Boolean),
  };
}
