import { setTimeout as delay } from "node:timers/promises";

import { Effect, Schema } from "effect";

import type {
  GitlabReadInvocation,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import { GitlabTransportError } from "./body.js";
import { runGitlabReadScope } from "./deadline.js";
import { requestGitlabProject } from "./request.js";

const targetSchema = Schema.Struct({
  host: Schema.NonEmptyString,
  project_path: Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/u)
  ),
  remote_name: Schema.NullOr(Schema.String),
  source: Schema.String,
});
const credentialSchema = Schema.Struct({
  kind: Schema.Literals(["pat", "oauth"]),
  token: Schema.String.check(Schema.isPattern(/^[!-~]{8,4096}$/u)),
});
/** Host-owned credentials are callback output, never agent parameters or feature configuration. */
interface GitlabTransportOptions {
  readonly hosts: readonly {
    readonly host: string;
    readonly apiOrigin: string;
    readonly credential: (signal: AbortSignal) => Promise<unknown>;
  }[];
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly redactValues?: readonly string[];
}
function errorResult(code: string): GitlabWireResult {
  return {
    code,
    kind: "error",
    message: `GitLab repository GET failed: ${code}`,
  };
}
function hostUrl(origin: string) {
  const url = new URL(origin);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new GitlabTransportError("INVALID_HOST_CONFIG");
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new GitlabTransportError("INVALID_HOST_CONFIG");
  }
  return url.origin;
}
async function readWithinScope(
  options: GitlabTransportOptions,
  input: unknown,
  signal: AbortSignal,
  deadline: number
): Promise<GitlabWireResult> {
  const target = Schema.decodeUnknownSync(targetSchema, {
    onExcessProperty: "error",
  })(input);
  if (
    target.project_path
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new GitlabTransportError("INVALID_INPUT");
  }
  const hosts = options.hosts.filter((host) => host.host === target.host);
  if (hosts.length !== 1) {
    throw new GitlabTransportError("HOST_NOT_ALLOWED");
  }
  const [host] = hosts;
  if (!host) {
    throw new GitlabTransportError("HOST_NOT_ALLOWED");
  }
  const origin = hostUrl(host.apiOrigin);
  if (signal.aborted || Date.now() >= deadline) {
    throw new GitlabTransportError("DEADLINE_EXCEEDED");
  }
  let credential: typeof credentialSchema.Type;
  try {
    credential = Schema.decodeUnknownSync(credentialSchema, {
      onExcessProperty: "error",
    })(await host.credential(signal));
  } catch {
    throw new GitlabTransportError("AUTH_REQUIRED");
  }
  const secrets = [credential.token, ...(options.redactValues ?? [])].toSorted(
    (a, b) => b.length - a.length
  );
  if (
    secrets.length > 32 ||
    secrets.some((value) => value.length < 1 || value.length > 4096)
  ) {
    throw new GitlabTransportError("INVALID_HOST_CONFIG");
  }
  const headers: Record<string, string> =
    credential.kind === "pat"
      ? { "PRIVATE-TOKEN": credential.token }
      : { Authorization: `Bearer ${credential.token}` };
  headers.Accept = "application/json";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted || Date.now() >= deadline) {
      throw new GitlabTransportError("CANCELLED");
    }
    // oxlint-disable-next-line no-await-in-loop -- Exactly two bounded read attempts share one original deadline.
    const result = await requestGitlabProject({
      headers,
      maxBytes: options.maxBytes ?? 2_097_152,
      secrets,
      signal,
      url: `${origin}/api/v4/projects/${encodeURIComponent(target.project_path)}`,
    });
    if (signal.aborted || Date.now() >= deadline) {
      throw new GitlabTransportError("DEADLINE_EXCEEDED");
    }
    if (result.kind !== "transient") {
      return result;
    }
    if (attempt === 1 || result.delay >= deadline - Date.now()) {
      return errorResult(result.code);
    }
    // oxlint-disable-next-line no-await-in-loop -- Honor Retry-After before the one remaining eligible attempt.
    await delay(result.delay, undefined, { signal });
  }
  return errorResult("LOOKUP_FAILED");
}
function readWithDeadline(
  options: GitlabTransportOptions,
  input: unknown,
  invocation: GitlabReadInvocation
): Promise<GitlabWireResult> | GitlabWireResult {
  const timeout = options.timeoutMs ?? 30_000;
  const maxBytes = options.maxBytes ?? 2_097_152;
  if (
    !Number.isFinite(timeout) ||
    timeout <= 0 ||
    timeout > 3_600_000 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 2_097_152 ||
    (invocation.deadline !== undefined && !Number.isFinite(invocation.deadline))
  ) {
    return errorResult("INVALID_HOST_CONFIG");
  }
  const deadline = Math.min(
    Date.now() + timeout,
    invocation.deadline ?? Infinity
  );
  if (invocation.signal?.aborted) {
    return errorResult("CANCELLED");
  }
  if (deadline <= Date.now()) {
    return errorResult("DEADLINE_EXCEEDED");
  }
  return runGitlabReadScope(
    invocation,
    deadline,
    (signal) => readWithinScope(options, input, signal, deadline),
    errorResult
  );
}
/** Create a bounded repository GET capability; no mutation or arbitrary request operation is exposed. */
export function createGitlabReadTransport(options: GitlabTransportOptions) {
  return {
    readProject: (input: unknown, invocation: GitlabReadInvocation = {}) =>
      Effect.tryPromise({
        catch: () => errorResult("LOOKUP_FAILED"),
        try: async () => await readWithDeadline(options, input, invocation),
      }).pipe(
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Effect.catch handles a typed failure channel, not a Promise callback.
        Effect.catch((error) => Effect.succeed(error))
      ),
  };
}
