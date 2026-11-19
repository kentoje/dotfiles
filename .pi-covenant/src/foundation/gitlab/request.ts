import type {
  GitlabCiRequest,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import {
  GitlabTransportError,
  readGitlabJsonBody,
  redactGitlabJson,
} from "./body.js";
import { readGitlabTraceWindow } from "./trace.js";

function gitlabHttpFailure(status: number) {
  switch (status) {
    case 401: {
      return "AUTH_REQUIRED";
    }
    case 403: {
      return "FORBIDDEN";
    }
    case 409: {
      return "WRITE_CONFLICT";
    }
    case 429: {
      return "RATE_LIMITED";
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
function gitlabLinkNext(link: string | null) {
  const next = link?.match(/<(?<url>[^>]+)>;\s*rel="next"/u)?.groups?.url;
  if (!next) {
    return null;
  }
  try {
    return Number(new URL(next).searchParams.get("page")) || -1;
  } catch {
    return -1;
  }
}
type GitlabAttempt =
  | GitlabWireResult
  | { kind: "transient"; code: string; delay: number };
async function rejectGitlabResponse(
  response: Response,
  write: boolean
): Promise<GitlabAttempt> {
  const retryAfter = response.headers.get("retry-after");
  await response.body?.cancel().catch(() => {
    // The invocation scope also aborts the owned request on exit.
  });
  if (write) {
    const rejected = [400, 401, 403, 404, 409, 422, 429].includes(
      response.status
    );
    return {
      code: rejected
        ? gitlabHttpFailure(response.status)
        : "REMOTE_STATE_UNKNOWN",
      delivery: rejected ? "rejected" : "unknown",
      kind: "error",
      message:
        "GitLab pipeline request did not return a valid acknowledgement.",
    };
  }
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
/** Use manual redirects; only transient reads are eligible for another attempt. */
export async function requestGitlabProject(options: {
  url: string;
  request?: GitlabCiRequest;
  onSend: () => void;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
  secrets: readonly string[];
}): Promise<GitlabAttempt> {
  const write =
    options.request?.kind === "retry" || options.request?.kind === "cancel";
  let response: Response;
  try {
    options.onSend();
    response = await fetch(options.url, {
      headers: options.headers,
      method: write ? "POST" : "GET",
      redirect: "manual",
      signal: options.signal,
    });
  } catch {
    if (write) {
      throw new GitlabTransportError("REMOTE_STATE_UNKNOWN");
    }
    if (options.signal.aborted) {
      throw new GitlabTransportError("CANCELLED");
    }
    return { code: "LOOKUP_FAILED", delay: 25, kind: "transient" };
  }
  if (!response.ok) {
    return rejectGitlabResponse(response, write);
  }
  if (options.request?.kind === "logs") {
    return {
      body: await readGitlabTraceWindow(response, {
        ...options.request,
        secrets: options.secrets,
      }),
      kind: "ok",
    };
  }
  const body = await readGitlabJsonBody(response, options.maxBytes);
  const redacted = redactGitlabJson(body, options.secrets);
  if (Buffer.byteLength(JSON.stringify(redacted)) > options.maxBytes) {
    throw new GitlabTransportError("OUTPUT_LIMIT");
  }
  if (options.request && "page" in options.request) {
    return {
      body: redacted,
      kind: "ok",
      pagination: {
        linkNext: gitlabLinkNext(response.headers.get("link")),
        next: response.headers.get("x-next-page"),
        page: response.headers.get("x-page"),
        perPage: response.headers.get("x-per-page"),
      },
    };
  }
  return { body: redacted, kind: "ok" };
}
