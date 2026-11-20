import type {
  GitlabCiRequest,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import {
  HttpTransportError,
  readBoundedJsonBody,
  redactHttpJson,
} from "../http/response-body.js";
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
      message: "GitLab write did not return a valid acknowledgement.",
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
interface GitlabRequestOptions {
  url: string;
  request?: GitlabCiRequest;
  method?: "POST" | "PUT";
  body?: object;
  paged?: boolean;
  acknowledgement?: number;
  onSend: () => void;
  headers: Record<string, string>;
  signal: AbortSignal;
  maxBytes: number;
  secrets: readonly string[];
}

async function decodeGitlabResponse(
  response: Response,
  options: GitlabRequestOptions
): Promise<GitlabWireResult> {
  if (options.request?.kind === "logs") {
    return {
      body: await readGitlabTraceWindow(response, {
        ...options.request,
        secrets: options.secrets,
      }),
      kind: "ok",
    };
  }
  const body = await readBoundedJsonBody(response, options.maxBytes);
  const redacted = redactHttpJson(body, options.secrets);
  if (Buffer.byteLength(JSON.stringify(redacted)) > options.maxBytes) {
    throw new HttpTransportError("OUTPUT_LIMIT");
  }
  if (options.paged || (options.request && "page" in options.request)) {
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

/** Use manual redirects; only transient reads are eligible for another attempt. */
export async function requestGitlabProject(
  options: GitlabRequestOptions
): Promise<GitlabAttempt> {
  const write =
    options.method !== undefined ||
    options.request?.kind === "retry" ||
    options.request?.kind === "cancel";
  const bodyText =
    options.body === undefined ? undefined : JSON.stringify(options.body);
  if (bodyText && Buffer.byteLength(bodyText) > 262_144) {
    throw new HttpTransportError("OUTPUT_LIMIT");
  }
  let response: Response;
  try {
    options.onSend();
    response = await fetch(options.url, {
      headers: bodyText
        ? { ...options.headers, "Content-Type": "application/json" }
        : options.headers,
      method: options.method ?? (write ? "POST" : "GET"),
      ...(bodyText ? { body: bodyText } : {}),
      redirect: "manual",
      signal: options.signal,
    });
  } catch {
    if (write) {
      throw new HttpTransportError("REMOTE_STATE_UNKNOWN");
    }
    if (options.signal.aborted) {
      throw new HttpTransportError("CANCELLED");
    }
    return { code: "LOOKUP_FAILED", delay: 25, kind: "transient" };
  }
  if (!response.ok) {
    return rejectGitlabResponse(response, write);
  }
  if (
    options.acknowledgement !== undefined &&
    response.status !== options.acknowledgement
  ) {
    await response.body?.cancel().catch(() => null);
    throw new HttpTransportError("REMOTE_STATE_UNKNOWN");
  }
  return decodeGitlabResponse(response, options);
}
