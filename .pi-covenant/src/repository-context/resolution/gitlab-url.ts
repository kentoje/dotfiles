import { Schema } from "effect";
/** Canonical GitLab identity excludes credentials, query strings and traversal. */
const gitlabTargetSchema = Schema.Struct({
  host: Schema.NonEmptyString,
  project_path: Schema.NonEmptyString,
  remote_name: Schema.NullOr(Schema.String),
  source: Schema.String,
});
/** A resolved service target carries observation provenance, never authentication material. */
export type GitlabTarget = typeof gitlabTargetSchema.Type;
/** Host-owned discovery configuration does not authorize remote writes. */
export interface GitlabSelection {
  readonly allowedHosts: readonly string[];
  readonly remote?: string;
  readonly hostMappings?: Readonly<Record<string, string>>;
}
/** Stable resolution failures never echo untrusted URL/userinfo into diagnostics. */
export class GitlabTargetError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "GitlabTargetError";
  }
}
/** Validate a canonical API authority independently of Git SSH syntax. */
function canonicalGitlabHost(input: string) {
  const host = input.toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*(?::[0-9]{1,5})?$/u.test(host)) {
    throw new GitlabTargetError("INVALID_GITLAB_HOST");
  }
  const parsed = new URL(`https://${host}`);
  if (
    parsed.host !== host &&
    !(host.endsWith(":443") && parsed.host === host.slice(0, -4))
  ) {
    throw new GitlabTargetError("INVALID_GITLAB_HOST");
  }
  return parsed.host;
}
/** Distinguish explicit service selectors from existing local repository identities. */
export function isGitlabSelector(value: string) {
  return /^(?:https?:\/\/|ssh:\/\/|[^/\s]+@[^/\s]+:|[A-Za-z0-9][A-Za-z0-9.-]+(?::\d+)?\/)/u.test(
    value
  );
}
function normalizeGitlabRemote(value: string) {
  if (value.includes("://")) {
    return value;
  }
  if (/^[^/:]+:\d+\//u.test(value)) {
    return `https://${value}`;
  }
  const scp = /^(?:[^@/:\s]+@)?(?<host>[^/:\s]+):(?<path>[^/].*)$/u.exec(value);
  if (scp?.groups) {
    return `ssh://git@${scp.groups.host}/${scp.groups.path}`;
  }
  return `https://${value}`;
}
function validateGitlabRemoteText(value: string) {
  if (value.includes("\\") || /[\0\r\n]/u.test(value)) {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
  if (decoded.split("/").some((part) => part === "." || part === "..")) {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
}
/** Normalize supported fetch URLs without invoking Git config, SSH aliases or credential helpers. */
export function parseGitlabTarget(
  value: string,
  selection: GitlabSelection
): Pick<GitlabTarget, "host" | "project_path"> {
  validateGitlabRemoteText(value);
  const normalized = normalizeGitlabRemote(value);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
  if (
    !["https:", "ssh:"].includes(url.protocol) ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === "https:" && url.username)
  ) {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
  let authority = url.host;
  if (url.protocol === "ssh:" && url.port === "22") {
    authority = url.hostname;
  }
  if (
    url.protocol === "ssh:" &&
    url.port &&
    url.port !== "22" &&
    !selection.hostMappings?.[authority]
  ) {
    throw new GitlabTargetError("UNSUPPORTED_SSH_MAPPING");
  }
  const host = canonicalGitlabHost(
    selection.hostMappings?.[authority] ?? authority
  );
  if (!selection.allowedHosts.map(canonicalGitlabHost).includes(host)) {
    throw new GitlabTargetError("HOST_NOT_ALLOWED");
  }
  const project_path = decodeURIComponent(url.pathname)
    .replace(/^\//u, "")
    .replace(/\/$/u, "")
    .replace(/\.git$/u, "");
  if (
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u.test(project_path) ||
    project_path.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new GitlabTargetError("UNSUPPORTED_GITLAB_REMOTE");
  }
  return { host, project_path };
}
