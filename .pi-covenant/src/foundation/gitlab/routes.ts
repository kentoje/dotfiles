import type { GitlabCiRequest } from "../../gitlab/module-port.js";

/** Map typed requests to one fixed GitLab REST endpoint. */
export function gitlabCiRoute(request: GitlabCiRequest) {
  const base = `/projects/${request.projectId}`;
  const query = new URLSearchParams();
  if ("page" in request) {
    query.set("page", String(request.page));
    query.set("per_page", String(request.pageSize));
  }
  switch (request.kind) {
    case "pipeline": {
      return `${base}/pipelines/${request.pipelineId}`;
    }
    case "job": {
      return `${base}/jobs/${request.jobId}`;
    }
    case "logs": {
      return `${base}/jobs/${request.jobId}/trace`;
    }
    case "retry":
    case "cancel": {
      return `${base}/pipelines/${request.pipelineId}/${request.kind}`;
    }
    case "jobs": {
      query.set("include_retried", String(request.includeRetried));
      return `${base}/pipelines/${request.pipelineId}/jobs?${query}`;
    }
    case "mergeRequests": {
      query.set("state", "opened");
      query.set("scope", "all");
      query.set("source_branch", request.branch);
      return `${base}/merge_requests?${query}`;
    }
    case "pipelines": {
      query.set("order_by", "id");
      query.set("sort", "desc");
      if (request.ref) {
        query.set("ref", request.ref);
      }
      if (request.sha) {
        query.set("sha", request.sha);
      }
      if (request.state) {
        query.set("status", request.state);
      }
      return `${base}/pipelines?${query}`;
    }
    default: {
      const unknownRequest: never = request;
      throw new Error(
        `GITLAB_ROUTE: unsupported request ${String(unknownRequest)}`
      );
    }
  }
}
