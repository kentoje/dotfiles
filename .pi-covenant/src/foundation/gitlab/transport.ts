import { setTimeout as delay } from "node:timers/promises";

import { Effect, Schema } from "effect";

import { gitlabCiRequest } from "../../gitlab/module-port.js";
import type {
  GitlabCiRequest,
  GitlabReadInvocation,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import type { MrRequest } from "../../mr/module-port.js";
import { HttpTransportError } from "../http/response-body.js";
import { gitlabMrRoute } from "../mr/routes.js";
import { runGitlabReadScope } from "./deadline.js";
import { requestGitlabProject } from "./request.js";
import { gitlabCiRoute } from "./routes.js";

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
function errorResult(
  code: string
): Extract<GitlabWireResult, { kind: "error" }> {
  return {
    code,
    kind: "error",
    message: `GitLab transport failed: ${code}`,
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
    throw new HttpTransportError("INVALID_HOST_CONFIG");
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new HttpTransportError("INVALID_HOST_CONFIG");
  }
  return url.origin;
}
async function authenticateGitlabHost(
  options: GitlabTransportOptions,
  input: unknown,
  signal: AbortSignal,
  deadline: number
) {
  const target = Schema.decodeUnknownSync(targetSchema, {
    onExcessProperty: "error",
  })(input);
  if (
    target.project_path
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new HttpTransportError("INVALID_INPUT");
  }
  const hosts = options.hosts.filter((host) => host.host === target.host);
  if (hosts.length !== 1) {
    throw new HttpTransportError("HOST_NOT_ALLOWED");
  }
  const [host] = hosts;
  if (!host) {
    throw new HttpTransportError("HOST_NOT_ALLOWED");
  }
  const origin = hostUrl(host.apiOrigin);
  if (signal.aborted || Date.now() >= deadline) {
    throw new HttpTransportError("DEADLINE_EXCEEDED");
  }
  let credential: typeof credentialSchema.Type;
  try {
    credential = Schema.decodeUnknownSync(credentialSchema, {
      onExcessProperty: "error",
    })(await host.credential(signal));
  } catch {
    throw new HttpTransportError("AUTH_REQUIRED");
  }
  const secrets = [credential.token, ...(options.redactValues ?? [])].toSorted(
    (a, b) => b.length - a.length
  );
  if (
    secrets.length > 32 ||
    secrets.some((value) => value.length < 1 || value.length > 4096)
  ) {
    throw new HttpTransportError("INVALID_HOST_CONFIG");
  }
  const headers: Record<string, string> =
    credential.kind === "pat"
      ? { "PRIVATE-TOKEN": credential.token }
      : { Authorization: `Bearer ${credential.token}` };
  headers.Accept = "application/json";

  return { headers, origin, projectPath: target.project_path, secrets };
}
function isGitlabWrite(request: GitlabCiRequest | MrRequest | undefined) {
  return (
    request?.kind === "retry" ||
    request?.kind === "cancel" ||
    request?.kind === "mrCreate" ||
    request?.kind === "mrReply" ||
    request?.kind === "mrResolve" ||
    request?.kind === "mrUpdate"
  );
}
function gitlabEndpoint(
  origin: string,
  projectPath: string,
  request: GitlabCiRequest | MrRequest | undefined
) {
  const api = `${origin}/api/v4`;
  if (!request) {
    return { url: `${api}/projects/${encodeURIComponent(projectPath)}` };
  }
  if (
    "iid" in request ||
    request.kind === "mrCreate" ||
    request.kind === "mrBranch"
  ) {
    const { path, ...details } = gitlabMrRoute(request);
    return { ...details, url: api + path };
  }
  return { request, url: api + gitlabCiRoute(request) };
}
async function readWithinScope(
  options: GitlabTransportOptions,
  input: unknown,
  signal: AbortSignal,
  deadline: number,
  request: GitlabCiRequest | MrRequest | undefined,
  onSend: () => void
): Promise<GitlabWireResult> {
  const { headers, origin, secrets, projectPath } =
    await authenticateGitlabHost(options, input, signal, deadline);
  const write = isGitlabWrite(request);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (signal.aborted || Date.now() >= deadline) {
      throw new HttpTransportError("CANCELLED");
    }
    // oxlint-disable-next-line no-await-in-loop -- Exactly two bounded read attempts share one original deadline.
    const result = await requestGitlabProject({
      headers,
      maxBytes: options.maxBytes ?? 2_097_152,
      secrets,
      signal,
      ...gitlabEndpoint(origin, projectPath, request),
      onSend,
    });
    if (write && result.kind !== "transient") {
      return result;
    }
    if (signal.aborted || Date.now() >= deadline) {
      throw new HttpTransportError("DEADLINE_EXCEEDED");
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
  invocation: GitlabReadInvocation,
  request?: GitlabCiRequest | MrRequest
): Promise<GitlabWireResult> | GitlabWireResult {
  const write = isGitlabWrite(request);
  const timeout = options.timeoutMs ?? (write ? 60_000 : 30_000);
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
    return { ...errorResult("CANCELLED"), delivery: "not_sent" };
  }
  if (deadline <= Date.now()) {
    return { ...errorResult("DEADLINE_EXCEEDED"), delivery: "not_sent" };
  }
  let sent = false;
  return runGitlabReadScope(
    invocation,
    deadline,
    (signal) =>
      readWithinScope(options, input, signal, deadline, request, () => {
        sent = true;
      }),
    (code) =>
      write && sent
        ? { ...errorResult("REMOTE_STATE_UNKNOWN"), delivery: "unknown" }
        : { ...errorResult(code), delivery: "not_sent" }
  );
}
/** Create bounded GitLab transport for fixed REST endpoints, with credential isolation and single-send writes. */
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
    requestCi: (
      input: unknown,
      request: unknown,
      invocation: GitlabReadInvocation = {}
    ) =>
      Effect.tryPromise({
        catch: () => errorResult("INVALID_INPUT"),
        try: async () =>
          await readWithDeadline(
            options,
            input,
            invocation,
            Schema.decodeUnknownSync(gitlabCiRequest, {
              onExcessProperty: "error",
            })(request)
          ),
      }).pipe(
        // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Recover the Effect error channel.
        Effect.catch((error) => Effect.succeed(error))
      ),
    requestMr: (
      input: unknown,
      request: MrRequest,
      invocation: GitlabReadInvocation = {}
    ) =>
      Effect.promise(
        async () => await readWithDeadline(options, input, invocation, request)
      ),
  };
}
