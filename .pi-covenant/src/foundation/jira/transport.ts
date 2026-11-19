import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type {
  JiraHost,
  JiraRequest,
  JiraResponse,
} from "../../jira/module-port.js";
import { readBoundedJsonBody, redactHttpJson } from "../http/response-body.js";
import { resolveJiraRoute } from "./routes.js";

export interface JiraHostConfig {
  readonly site: string;
  readonly email: string;
  readonly credentialFile: string;
}

function jiraOrigin(site: string) {
  const url = URL.parse(site);
  if (
    !url ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      "JIRA_CONFIG: use one HTTPS Jira site origin in host configuration."
    );
  }
  return url.origin;
}

async function loadJiraCredential(file: string) {
  try {
    if (!isAbsolute(file)) {
      throw new Error("Unsupported Jira transport input.");
    }
    // oxlint-disable-next-line no-bitwise -- Nonblocking open lets the following file-type check reject a FIFO.
    const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 4096) {
        throw new Error("Unsupported Jira transport input.");
      }
      const buffer = Buffer.alloc(4097);
      const { bytesRead } = await handle.read(buffer, {
        length: buffer.length,
      });
      const token = buffer.subarray(0, bytesRead).toString("utf-8").trim();
      if (bytesRead > 4096 || !/^[!-~]+$/u.test(token)) {
        throw new Error("Unsupported Jira transport input.");
      }
      return token;
    } finally {
      await handle.close();
    }
  } catch {
    throw new Error(
      "JIRA_CONFIG: expected a readable API token in an absolute host credential file."
    );
  }
}

async function checkJiraHttpResponse(
  response: Response,
  acknowledgement: number | undefined,
  secrets: readonly string[]
): Promise<JiraResponse> {
  const { status } = response;
  if (acknowledgement === 204 && status === 204) {
    return { kind: "acknowledged" };
  }
  if (status !== (acknowledgement ?? 200)) {
    await response.body?.cancel().catch(() => null);
    if ([400, 401, 403, 404, 405, 409, 413, 415, 422].includes(status)) {
      return { kind: "rejected", status };
    }
    return { kind: acknowledgement ? "unknown" : "unavailable" };
  }
  try {
    const data = redactHttpJson(
      await readBoundedJsonBody(response, 2_097_152),
      secrets
    );
    if (JSON.stringify(data).length > 2_097_152) {
      throw new Error("Unsupported Jira transport input.");
    }
    return { data, kind: "ok" };
  } catch {
    return { kind: acknowledgement ? "acknowledged" : "unavailable" };
  }
}

export async function createJiraCloudHost(
  config: JiraHostConfig
): Promise<Pick<JiraHost, "request" | "site">> {
  const site = jiraOrigin(config.site);
  if (!/^[^:\s@]+@[^:\s@]+$/u.test(config.email)) {
    throw new Error("JIRA_CONFIG: set a valid Jira account email.");
  }
  const token = await loadJiraCredential(config.credentialFile);
  const credential = Buffer.from(`${config.email}:${token}`).toString("base64");
  const secrets = [credential, token];
  const request = async (
    input: JiraRequest,
    signal: AbortSignal
  ): Promise<JiraResponse> => {
    const { path, method, acknowledgement } = resolveJiraRoute(input);
    const body = "body" in input ? JSON.stringify(input.body) : undefined;
    if (body && Buffer.byteLength(body) > 65_536) {
      return { kind: "rejected", status: 413 };
    }
    const send = () =>
      fetch(site + path, {
        headers: {
          accept: "application/json",
          authorization: `Basic ${credential}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        method,
        redirect: "manual",
        signal,
        ...(body ? { body } : {}),
      });
    if (signal.aborted) {
      return { kind: "stopped" };
    }
    try {
      let response = await send();
      if (method === "GET" && [502, 503, 504].includes(response.status)) {
        await response.body?.cancel().catch(() => null);
        if (signal.aborted) {
          return { kind: "stopped" };
        }
        response = await send();
      }
      return await checkJiraHttpResponse(response, acknowledgement, secrets);
    } catch {
      return { kind: acknowledgement ? "unknown" : "unavailable" };
    }
  };
  return { request, site };
}
