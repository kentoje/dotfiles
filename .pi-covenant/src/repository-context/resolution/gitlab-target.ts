import { join } from "node:path";

import { GitlabTargetError, parseGitlabTarget } from "./gitlab-url.js";
import type { GitlabSelection, GitlabTarget } from "./gitlab-url.js";
import { readContextMetadata } from "./metadata.js";

function configValue(value: string) {
  const text = value.trim();
  if (text.startsWith('"')) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      throw new GitlabTargetError("UNSUPPORTED_GIT_CONFIG");
    }
    if (typeof decoded !== "string") {
      throw new GitlabTargetError("UNSUPPORTED_GIT_CONFIG");
    }
    return decoded;
  }
  return text.split(/\s[;#]/u)[0] ?? "";
}
function fetchRemotes(config: string) {
  let remote: string | null = null;
  const found: { name: string; url: string }[] = [];
  for (const line of config.split("\n")) {
    const text = line.trim();
    if (!text || /^[#;]/u.test(text)) {
      continue;
    }
    if (/^\[url\s/iu.test(text)) {
      throw new GitlabTargetError("UNSUPPORTED_GIT_URL_REWRITE");
    }
    if (/^\[include(?:if)?\b/iu.test(text)) {
      throw new GitlabTargetError("UNSUPPORTED_GIT_CONFIG_INCLUDE");
    }
    if (text.startsWith("[")) {
      const match = /^\[remote "(?<name>[A-Za-z0-9._-]+)"\]$/u.exec(text);
      remote = match?.groups?.name ?? null;
      continue;
    }
    if (remote) {
      if (/^vcs\s*=/iu.test(text)) {
        throw new GitlabTargetError("UNSUPPORTED_GIT_REMOTE_HELPER");
      }
      const match = /^url\s*=\s*(?<url>.+)$/iu.exec(text);
      if (match?.groups?.url) {
        found.push({ name: remote, url: configValue(match.groups.url) });
      }
    }
  }
  return found;
}
function eligibleRemotes(config: string, selection: GitlabSelection) {
  const result: {
    name: string;
    target: Pick<GitlabTarget, "host" | "project_path">;
  }[] = [];
  for (const remote of fetchRemotes(config)) {
    if (selection.remote && remote.name !== selection.remote) {
      continue;
    }
    try {
      result.push({
        name: remote.name,
        target: parseGitlabTarget(remote.url, selection),
      });
    } catch (error) {
      if (selection.remote) {
        throw error;
      }
    }
  }
  return result;
}
/** Discover only allowed fetch remotes; explicit checkout conflicts cannot be hidden by origin preference. */
export async function resolveGitlabTarget(options: {
  selection: GitlabSelection;
  commonDir: string | null;
  gitDir: string | null;
  explicit: string | undefined;
  explicitCwd: boolean;
}): Promise<GitlabTarget> {
  const explicit = options.explicit
    ? parseGitlabTarget(options.explicit, options.selection)
    : null;
  let remotes: ReturnType<typeof eligibleRemotes> = [];
  if (options.commonDir) {
    try {
      if (
        options.gitDir &&
        (await readContextMetadata(join(options.gitDir, "config.worktree"))) !==
          null
      ) {
        throw new GitlabTargetError("UNSUPPORTED_GIT_WORKTREE_CONFIG");
      }
      const config = await readContextMetadata(
        join(options.commonDir, "config")
      );
      remotes = eligibleRemotes(config ?? "", options.selection);
    } catch (error) {
      if (!explicit || options.explicitCwd) {
        throw error;
      }
    }
  }
  if (explicit) {
    const matching = remotes.find(
      (remote) =>
        remote.target.host === explicit.host &&
        remote.target.project_path === explicit.project_path
    );
    if (options.explicitCwd && options.commonDir && !matching) {
      throw new GitlabTargetError("CONTEXT_CONFLICT");
    }
    return {
      ...explicit,
      remote_name: matching?.name ?? null,
      source: "explicit repository selector",
    };
  }
  const distinct = new Map(
    remotes.map((remote) => [
      `${remote.target.host}/${remote.target.project_path}`,
      remote,
    ])
  );
  if (distinct.size !== 1) {
    throw new GitlabTargetError(
      distinct.size ? "AMBIGUOUS_REMOTE" : "CONTEXT_UNAVAILABLE"
    );
  }
  const [remote] = distinct.values();
  if (!remote) {
    throw new GitlabTargetError("CONTEXT_UNAVAILABLE");
  }
  return {
    ...remote.target,
    remote_name: remote.name,
    source: `Git fetch remote ${remote.name}`,
  };
}
