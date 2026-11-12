import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** Read bounded regular local metadata without executing project code. */
export async function readContextMetadata(
  path: string,
  limit = 65_536
): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > limit) {
      throw new Error("CONTEXT_METADATA: expected bounded regular file");
    }
    return await readFile(path, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
/** Locate Git metadata and nearest project marker while walking canonical ancestors. */
export async function locateProjectRoots(start: string) {
  let path = start;
  let project: string | null = null;
  while (true) {
    for (const marker of ["project-checks.json", "package.json"]) {
      if (
        !project &&
        // oxlint-disable-next-line no-await-in-loop -- Ascend in order to select the nearest project marker.
        (await readContextMetadata(join(path, marker), 1_048_576)) !== null
      ) {
        project = path;
      }
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- Git ancestry must be observed in order.
      const info = await stat(join(path, ".git"));
      if (info.isDirectory() || info.isFile()) {
        return { project: project ?? path, worktree: path };
      }
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      ) {
        throw error;
      }
    }
    const parent = dirname(path);
    if (parent === path) {
      return { project: project ?? start, worktree: null };
    }
    path = parent;
  }
}
async function readGitHeadFacts(
  commonDir: string,
  gitdir: string,
  worktree: string
) {
  const headText = await readContextMetadata(join(gitdir, "HEAD"), 4096);
  const head = headText?.trim() ?? "";
  const ref = head.startsWith("ref: ") ? head.slice(5) : null;
  if (
    ref &&
    (!/^refs\/[A-Za-z0-9._/-]+$/u.test(ref) || ref.split("/").includes(".."))
  ) {
    throw new Error("CONTEXT_GIT: unsupported HEAD reference");
  }
  const loose = ref
    ? await readContextMetadata(join(commonDir, ref), 4096)
    : head;
  let sha = loose?.trim() ?? null;
  if (ref && !sha) {
    const packed = await readContextMetadata(join(commonDir, "packed-refs"));
    sha =
      packed
        ?.split("\n")
        .find((line) => line.endsWith(` ${ref}`))
        ?.split(" ")[0] ?? null;
  }
  return {
    branch: ref?.startsWith("refs/heads/") ? ref.slice(11) : null,
    git_root: basename(commonDir) === ".git" ? dirname(commonDir) : worktree,
    head_sha: sha && /^[a-f0-9]{40,64}$/u.test(sha) ? sha : null,
    repository_id: commonDir,
    source: gitdir,
    worktree_root: worktree,
  };
}

/** Observe branch and object identity from Git metadata; no fetch or Git subprocess. */
export async function readLocalGitFacts(worktree: string) {
  const marker = join(worktree, ".git");
  const info = await stat(marker);
  const pointer = info.isDirectory()
    ? null
    : await readContextMetadata(marker, 4096);
  if (pointer !== null && !/^gitdir: .+\s*$/u.test(pointer)) {
    throw new Error("CONTEXT_GIT: malformed gitdir pointer");
  }
  const gitdir = await realpath(
    pointer === null ? marker : resolve(worktree, pointer.slice(8).trim())
  );
  const common = await readContextMetadata(join(gitdir, "commondir"), 4096);
  const commonDir =
    common === null ? gitdir : await realpath(resolve(gitdir, common.trim()));
  return readGitHeadFacts(commonDir, gitdir, worktree);
}
