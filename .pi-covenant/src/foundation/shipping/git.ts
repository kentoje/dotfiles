import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { parseGitlabTarget } from "../../repository-context/module-port.js";
import { ShipFailureError } from "../../shipping/module-port.js";
import type {
  ShipInvocation,
  ShipScope,
  ShipTarget,
} from "../../shipping/module-port.js";

const execGit = promisify(execFile);

export async function runShipGit(
  cwd: string,
  args: readonly string[],
  invocation: ShipInvocation,
  cap = 10_000
) {
  invocation.signal.throwIfAborted();
  const { stdout } = await execGit(
    "git",
    ["--no-pager", "--literal-pathspecs", ...args],
    {
      cwd,
      maxBuffer: 1_048_576,
      signal: invocation.signal,
      timeout: Math.max(1, Math.min(cap, invocation.deadline - Date.now())),
    }
  );
  return stdout;
}
export async function readShipBranch(cwd: string, invocation: ShipInvocation) {
  const [branch, head] = await Promise.all([
    runShipGit(
      cwd,
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      invocation
    ).catch(() => null),
    runShipGit(cwd, ["rev-parse", "--verify", "HEAD^{commit}"], invocation),
  ]);
  if (!branch || !/^[a-f0-9]{40,64}$/u.test(head.trim())) {
    throw new ShipFailureError(
      "DEFAULT_OR_DETACHED_BRANCH",
      "A named task branch with a commit is required."
    );
  }
  return { branch: branch.trim(), head: head.trim() };
}
function parseShipChanges(output: string) {
  const result = new Map<string, string>();
  for (const entry of output.split("\0").filter(Boolean)) {
    const flag = entry.slice(0, 2);
    const path = entry.slice(3);
    if (
      entry[2] !== " " ||
      path.includes("\uFFFD") ||
      ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(flag)
    ) {
      throw new ShipFailureError(
        "TASK_SCOPE_AMBIGUOUS",
        "Resolve the unmerged or unsupported Git status before shipping."
      );
    }
    result.set(path, flag);
  }
  return result;
}
async function fingerprintShipPath(
  cwd: string,
  path: string,
  signal: AbortSignal
) {
  try {
    const file = join(cwd, path);
    const location = await lstat(file);
    if (
      location.size > 32_000_000 ||
      (!location.isFile() && !location.isSymbolicLink())
    ) {
      throw new ShipFailureError(
        "TASK_SCOPE_AMBIGUOUS",
        "Task scope must contain bounded files or symlinks.",
        path
      );
    }
    const body = location.isSymbolicLink()
      ? await readlink(file)
      : await readFile(file, { signal });
    return `${location.mode}:${createHash("sha256").update(body).digest("hex")}`;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return "missing";
    }
    throw error;
  }
}
export async function prepareShipScope(
  target: ShipTarget,
  paths: readonly string[],
  invocation: ShipInvocation
) {
  const current = await readShipBranch(target.cwd, invocation);
  if (current.branch !== target.branch || current.head !== target.head) {
    throw new ShipFailureError(
      "HEAD_CHANGED",
      "The selected checkout branch or head changed."
    );
  }
  const changes = parseShipChanges(
    await runShipGit(
      target.cwd,
      [
        "status",
        "--porcelain=v1",
        "-z",
        "--no-renames",
        "--untracked-files=all",
      ],
      invocation
    )
  );
  if (!paths.length && changes.size) {
    throw new ShipFailureError(
      "TASK_SCOPE_AMBIGUOUS",
      "Specify exact task_paths for dirty files or ship from a clean checkout."
    );
  }
  const selected = paths.filter((path) => changes.has(path));
  for (const path of paths) {
    if (!changes.has(path)) {
      // oxlint-disable-next-line no-await-in-loop -- A clean path must be an exact tracked file, not a broad pathspec.
      const tracked = await runShipGit(
        target.cwd,
        ["ls-files", "-z", "--", path],
        invocation
      );
      if (tracked !== `${path}\0`) {
        throw new ShipFailureError(
          "TASK_SCOPE_AMBIGUOUS",
          "Task scope must name exact changed or tracked files.",
          path
        );
      }
    }
  }
  const fingerprints = [];
  for (const path of paths) {
    invocation.signal.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- Bound memory to one selected file while hashing.
    const digest = await fingerprintShipPath(
      target.cwd,
      path,
      invocation.signal
    );
    fingerprints.push([path, changes.get(path), digest]);
  }
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([current, fingerprints]))
    .digest("hex");
  const untracked = selected.filter((path) => changes.get(path) === "??");
  return { fingerprint, hasChanges: selected.length > 0, paths, untracked };
}

/** Use Git's path-specific commit while keeping unrelated index entries and worktree edits intact. */
export async function commitShipScope(
  target: ShipTarget,
  scope: ShipScope,
  message: string,
  invocation: ShipInvocation
) {
  const checked = await prepareShipScope(target, scope.paths, invocation);
  if (checked.fingerprint !== scope.fingerprint) {
    throw new ShipFailureError(
      "SCOPE_CHANGED",
      "Task changes changed after checks. Recheck before committing."
    );
  }
  try {
    if (checked.untracked.length) {
      await runShipGit(
        target.cwd,
        ["add", "--intent-to-add", "--", ...checked.untracked],
        invocation
      );
    }
    await runShipGit(
      target.cwd,
      ["commit", "--only", "-m", message, "--", ...scope.paths],
      invocation,
      60_000
    );
  } catch {
    const recovery = {
      deadline: Date.now() + 5000,
      signal: AbortSignal.timeout(5000),
    };
    const current = await readShipBranch(target.cwd, recovery).catch(
      () => null
    );
    if (
      current?.branch === target.branch &&
      current.head === target.head &&
      checked.untracked.length
    ) {
      await runShipGit(
        target.cwd,
        ["reset", "--quiet", "HEAD", "--", ...checked.untracked],
        recovery
      ).catch(() => null);
    }
    if (current?.head !== target.head) {
      throw new ShipFailureError(
        "COMMIT_STATE_UNKNOWN",
        "Inspect the current branch for the interrupted commit.",
        current?.head ?? null,
        "indeterminate"
      );
    }
    invocation.signal.throwIfAborted();
    throw new ShipFailureError(
      "COMMIT_FAILED",
      "Git could not commit the selected task files."
    );
  }
  const current = await readShipBranch(target.cwd, {
    deadline: Date.now() + 5000,
    signal: AbortSignal.timeout(5000),
  });
  const paths = await runShipGit(
    target.cwd,
    ["diff-tree", "--no-commit-id", "--name-only", "-z", "-r", current.head],
    { deadline: Date.now() + 5000, signal: AbortSignal.timeout(5000) }
  );
  const changed = paths.split("\0").filter(Boolean);
  if (
    current.branch !== target.branch ||
    !changed.length ||
    changed.some((path) => !scope.paths.includes(path))
  ) {
    throw new ShipFailureError(
      "COMMIT_SCOPE_UNKNOWN",
      "The resulting commit scope could not be verified. Inspect it before pushing.",
      current.head,
      "indeterminate"
    );
  }
  return current.head;
}

async function verifyShipPushRemote(
  target: ShipTarget,
  invocation: ShipInvocation
) {
  const expected = new URL(target.repository);
  const urls = await runShipGit(
    target.cwd,
    ["remote", "get-url", "--push", "--all", target.remote],
    invocation
  );
  const [url, ...more] = urls.trim().split("\n");
  if (!url || more.length) {
    throw new ShipFailureError(
      "PUSH_TARGET_UNVERIFIED",
      "Exactly one push URL is required for the selected remote."
    );
  }
  const canonical = parseGitlabTarget(url, { allowedHosts: [expected.host] });
  if (
    canonical.host !== expected.host ||
    `/${canonical.project_path}` !== expected.pathname
  ) {
    throw new ShipFailureError(
      "PUSH_TARGET_UNVERIFIED",
      "The effective Git push URL differs from the selected GitLab repository."
    );
  }
}
export async function pushShipHead(
  target: ShipTarget,
  head: string,
  invocation: ShipInvocation
) {
  const current = await readShipBranch(target.cwd, invocation);
  if (current.head !== head || current.branch !== target.branch) {
    throw new ShipFailureError(
      "HEAD_CHANGED",
      "The selected local head changed before push."
    );
  }
  await verifyShipPushRemote(target, invocation);
  try {
    await runShipGit(
      target.cwd,
      [
        "-c",
        "push.followTags=false",
        "-c",
        "push.pushOption=",
        "-c",
        `remote.${target.remote}.mirror=false`,
        "push",
        "--porcelain",
        "--no-follow-tags",
        "--recurse-submodules=no",
        "--",
        target.remote,
        `${head}:refs/heads/${target.branch}`,
      ],
      invocation,
      120_000
    );
  } catch (error) {
    const stdout =
      error instanceof Error &&
      "stdout" in error &&
      typeof error.stdout === "string"
        ? error.stdout
        : "";
    if (stdout.includes("[rejected]") || stdout.includes("[remote rejected]")) {
      throw new ShipFailureError(
        "PUSH_FAILED",
        "Git rejected the normal push. Inspect the remote branch before retrying."
      );
    }
    throw new ShipFailureError(
      "REMOTE_STATE_UNKNOWN",
      "Push acknowledgement was unavailable. Inspect the remote branch before retrying.",
      head,
      "indeterminate"
    );
  }
}
