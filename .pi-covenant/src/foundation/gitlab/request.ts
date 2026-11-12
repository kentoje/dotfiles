import type { GitlabWireResult } from "../../gitlab/module-port.js";
import {
  GitlabTransportError,
  readGitlabJsonBody,
  redactGitlabJson,
} from "./body.js";

function gitlabHttpFailure(status: number) {
  switch (status) {
    case 401: {
      return "AUTH_REQUIRED";
    }
    case 403: {
      return "FORBIDDEN";
    }
    case 404: {
      return "NOT_FOUND";
    }
    default: {
      return status >= 300 && status < 400
        ? "REDIRECT_BLOCKED"
        : "LOOKUP_FAILED";
    }
  }
}
/** One host attempt is always GET and manual redirect; transient failures alone are eligible for one application retry. */
export async function requestGitlabProject(options: {
  url: string;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
  secrets: readonly string[];
}): Promise<
  GitlabWireResult | { kind: "transient"; code: string; delay: number }
> {
  let response: Response;
  try {
    response = await fetch(options.url, {
      headers: options.headers,
      method: "GET",
      redirect: "manual",
      signal: options.signal,
    });
  } catch {
    if (options.signal.aborted) {
      throw new GitlabTransportError("CANCELLED");
    }
    return { code: "LOOKUP_FAILED", delay: 25, kind: "transient" };
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    await response.body?.cancel().catch(() => {
      // The invocation scope also aborts the owned request on exit.
    });
    if ([429, 502, 503, 504].includes(response.status)) {
      const seconds =
        retryAfter && /^\d+(?:\.\d+)?$/u.test(retryAfter)
          ? Number(retryAfter) * 1000
          : null;
      const date = retryAfter ? Date.parse(retryAfter) : Number.NaN;
      return {
        code: response.status === 429 ? "RATE_LIMITED" : "LOOKUP_FAILED",
        delay:
          seconds ??
          (Number.isFinite(date) ? Math.max(0, date - Date.now()) : 25),
        kind: "transient",
      };
    }
    const code = gitlabHttpFailure(response.status);
    return {
      code,
      kind: "error",
      message: "GitLab repository GET was rejected.",
    };
  }
  const body = await readGitlabJsonBody(response, options.maxBytes);
  const redacted = redactGitlabJson(body, options.secrets);
  if (Buffer.byteLength(JSON.stringify(redacted)) > options.maxBytes) {
    throw new GitlabTransportError("OUTPUT_LIMIT");
  }
  return { body: redacted, kind: "ok" };
}
