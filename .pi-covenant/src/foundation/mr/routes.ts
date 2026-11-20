import type { MrRequest } from "../../mr/module-port.js";
import { HttpTransportError } from "../http/response-body.js";

export function gitlabMrRoute(request: MrRequest): {
  path: string;
  method?: "POST" | "PUT";
  body?: object;
  paged?: boolean;
  acknowledgement?: number;
} {
  if (!Number.isSafeInteger(request.projectId) || request.projectId < 1) {
    throw new HttpTransportError("INVALID_INPUT");
  }
  if (request.kind === "mrBranch") {
    return {
      path: `/projects/${request.projectId}/repository/branches/${encodeURIComponent(request.branch)}`,
    };
  }
  if (request.kind === "mrCreate") {
    return {
      acknowledgement: 201,
      body: {
        source_branch: request.sourceBranch,
        target_branch: request.targetBranch,
        title: request.title,
        ...(typeof request.description === "string"
          ? { description: request.description }
          : {}),
      },
      method: "POST",
      path: `/projects/${request.projectId}/merge_requests`,
    };
  }
  if (
    !Number.isSafeInteger(request.iid) ||
    request.iid < 1 ||
    !Number.isSafeInteger(request.projectId) ||
    request.projectId < 1
  ) {
    throw new HttpTransportError("INVALID_INPUT");
  }
  const mr = `/projects/${request.projectId}/merge_requests/${request.iid}`;
  const discussion = `${mr}/discussions`;
  if (
    "threadId" in request &&
    !/^[a-z0-9_-]{1,128}$/iu.test(request.threadId)
  ) {
    throw new HttpTransportError("INVALID_INPUT");
  }
  switch (request.kind) {
    case "mr": {
      return { path: mr };
    }
    case "mrDiscussions": {
      return {
        paged: true,
        path: `${discussion}?${new URLSearchParams({ page: String(request.page), per_page: String(request.pageSize) })}`,
      };
    }
    case "mrDiscussion": {
      return { path: `${discussion}/${request.threadId}` };
    }
    case "mrReply": {
      return {
        acknowledgement: 201,
        body: { body: request.body },
        method: "POST",
        path: `${discussion}/${request.threadId}/notes`,
      };
    }
    case "mrResolve": {
      return {
        acknowledgement: 200,
        body: { resolved: true },
        method: "PUT",
        path: `${discussion}/${request.threadId}`,
      };
    }
    case "mrUpdate": {
      return {
        acknowledgement: 200,
        body: request.patch,
        method: "PUT",
        path: mr,
      };
    }
    default: {
      const unreachable: never = request;
      return unreachable;
    }
  }
}
