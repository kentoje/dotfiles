import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { Schema } from "effect";

import { resolveGitlabTarget } from "./gitlab-target.js";
import { GitlabTargetError, isGitlabSelector } from "./gitlab-url.js";
import type { GitlabSelection } from "./gitlab-url.js";
import {
  locateProjectRoots,
  readLocalGitFacts,
  readContextMetadata,
} from "./metadata.js";

const contextRequest = Schema.Struct({
  cwd: Schema.optionalKey(Schema.NonEmptyString),
  repository: Schema.optionalKey(Schema.NonEmptyString),
});
type LocalGitFacts = Awaited<ReturnType<typeof readLocalGitFacts>>;
function unavailableContextFacts(git: LocalGitFacts | null) {
  const unavailable = [
    {
      fact: "gitlab_host",
      reason: "Remote service identity is not resolved by local lookup.",
    },
    { fact: "default_branch", reason: "No remote policy lookup is performed." },
  ];
  if (git === null) {
    unavailable.push({
      fact: "git",
      reason: "Selected project has no Git metadata.",
    });
  } else if (git.head_sha === null) {
    unavailable.push({
      fact: "head_sha",
      reason: "Git HEAD has no readable committed object identity.",
    });
  }
  return unavailable;
}
function contextData(
  project: string,
  git: LocalGitFacts | null,
  source: string,
  manifest: string | null
) {
  const facts = git ?? {
    branch: null,
    git_root: null,
    head_sha: null,
    repository_id: null,
    worktree_root: null,
  };
  return {
    available_capabilities: [],
    branch: facts.branch,
    default_branch: null,
    git_root: facts.git_root,
    gitlab_host: null,
    head_sha: facts.head_sha,
    project_cli_manifest:
      manifest === null ? null : resolve(project, "project-checks.json"),
    project_root: project,
    repository_id: facts.repository_id,
    sources: [
      { fact: "project_root", source },
      ...(git
        ? [
            "git_root",
            "worktree_root",
            "repository_id",
            "branch",
            "head_sha",
          ].map((fact) => ({ fact, source: git.source }))
        : []),
    ],
    unavailable: unavailableContextFacts(git),
    worktree_root: facts.worktree_root,
  };
}
function requireLocalRepositoryChoice(
  request: typeof contextRequest.Type,
  git: LocalGitFacts | null,
  project: string,
  selection: GitlabSelection | undefined
) {
  const { repository } = request;
  if (!repository) {
    return;
  }
  if (selection && isGitlabSelector(repository)) {
    return;
  }
  if (
    ![git?.repository_id, git?.git_root, git?.worktree_root, project].includes(
      repository
    )
  ) {
    throw new Error(
      "CONTEXT_CONFLICT: repository differs from selected canonical path"
    );
  }
}
/** Canonical local project facts retain nulls and provenance instead of inventing service policy. */
export async function resolveProjectContext(
  input: unknown,
  host: { sessionCwd: string; gitlab?: GitlabSelection }
) {
  try {
    const request = Schema.decodeUnknownSync(contextRequest, {
      onExcessProperty: "error",
    })(input);
    const selected = await realpath(
      resolve(host.sessionCwd, request.cwd ?? ".")
    );
    const info = await stat(selected);
    if (!info.isDirectory()) {
      throw new Error("CONTEXT_PATH: selected path must be a directory");
    }
    const roots = await locateProjectRoots(selected);
    const git = roots.worktree ? await readLocalGitFacts(roots.worktree) : null;
    requireLocalRepositoryChoice(request, git, roots.project, host.gitlab);
    const manifest = await readContextMetadata(
      resolve(roots.project, "project-checks.json"),
      1_048_576
    );
    const data = contextData(
      roots.project,
      git,
      request.cwd ? "explicit cwd" : "Pi session cwd",
      manifest
    );
    const target = host.gitlab
      ? await resolveGitlabTarget({
          commonDir: data.repository_id,
          explicit:
            request.repository && isGitlabSelector(request.repository)
              ? request.repository
              : undefined,
          explicitCwd: request.cwd !== undefined,
          gitDir: git?.source ?? null,
          selection: host.gitlab,
        })
      : null;
    const resolvedData = {
      ...data,
      ...(target
        ? {
            gitlab_host: target.host,
            gitlab_target: target,
            sources: [
              ...data.sources,
              { fact: "gitlab_target", source: target.source },
              { fact: "gitlab_host", source: target.source },
            ],
            unavailable: data.unavailable.filter(
              (fact) => fact.fact !== "gitlab_host"
            ),
          }
        : {}),
    };
    return {
      completed_effects: [],
      context: { project: roots.project, repository: data.repository_id },
      data: resolvedData,
      error: null,
      status: "ok",
      warnings: [],
    };
  } catch (error) {
    return {
      completed_effects: [],
      context: {},
      data: null,
      error: {
        code:
          error instanceof GitlabTargetError
            ? error.code
            : "REPOSITORY_CONTEXT",
        message:
          error instanceof Error ? error.message : "Unable to resolve project.",
        phase: "context",
        retryable: false,
      },
      status: "blocked",
      warnings: [],
    };
  }
}
