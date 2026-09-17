import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Stable Git identity used to cache verification while HEAD and file content are unchanged. */
export const verificationGitFingerprint = async (
  pi: Pick<ExtensionAPI, "exec">,
  worktree: string,
): Promise<string | undefined> => {
  const [head, status, diff, untracked] = await Promise.all([
    pi.exec("git", ["rev-parse", "HEAD"], { cwd: worktree }),
    pi.exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: worktree,
    }),
    pi.exec("git", ["diff", "--binary", "HEAD", "--"], { cwd: worktree }),
    pi.exec("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: worktree,
    }),
  ]);
  if (
    head.code !== 0 ||
    status.code !== 0 ||
    diff.code !== 0 ||
    untracked.code !== 0
  ) {
    return undefined;
  }
  const untrackedFiles = untracked.stdout.split("\n").filter(Boolean);
  const untrackedHashes =
    untrackedFiles.length === 0
      ? ""
      : (
          await pi.exec("git", ["hash-object", "--", ...untrackedFiles], {
            cwd: worktree,
          })
        ).stdout;
  return [
    head.stdout.trim(),
    status.stdout,
    diff.stdout,
    untracked.stdout,
    untrackedHashes,
  ].join("\u0000");
};
