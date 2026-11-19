import type { JiraRequest } from "../../jira/module-port.js";

export function resolveJiraRoute(request: JiraRequest): {
  path: string;
  method: "GET" | "POST" | "PUT";
  acknowledgement?: number;
} {
  const issue = "/rest/api/3/issue";
  const target =
    "key" in request ? `${issue}/${encodeURIComponent(request.key)}` : issue;
  switch (request.route) {
    case "issue": {
      const fields = [
        ...new Set(["summary", "status", "project", ...(request.fields ?? [])]),
      ];
      return {
        method: "GET",
        path: `${target}?${new URLSearchParams({ fields: fields.join(",") })}`,
      };
    }
    case "search": {
      return { method: "GET", path: `/rest/api/3/search/jql?${request.query}` };
    }
    case "types":
    case "create-fields": {
      const path = `${issue}/createmeta/${encodeURIComponent(
        request.project
      )}/issuetypes`;
      const type = request.type ? `/${encodeURIComponent(request.type)}` : "";
      return {
        method: "GET",
        path: `${path + type}?${new URLSearchParams({
          maxResults: "100",
          startAt: String(request.start),
        })}`,
      };
    }
    case "edit-fields": {
      return { method: "GET", path: `${target}/editmeta` };
    }
    case "transitions": {
      return {
        method: "GET",
        path: `${target}/transitions?expand=transitions.fields`,
      };
    }
    case "create": {
      return { acknowledgement: 201, method: "POST", path: issue };
    }
    case "update": {
      return { acknowledgement: 204, method: "PUT", path: target };
    }
    case "comment": {
      return {
        acknowledgement: 201,
        method: "POST",
        path: `${target}/comment`,
      };
    }
    case "transition": {
      return {
        acknowledgement: 204,
        method: "POST",
        path: `${target}/transitions`,
      };
    }
    default: {
      const unhandled: never = request;
      return unhandled;
    }
  }
}
