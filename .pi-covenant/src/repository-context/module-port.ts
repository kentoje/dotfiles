/** Local repository context resolution performs metadata reads only, with explicit unavailable facts. */
export { resolveProjectContext } from "./resolution/resolve.js";

/** GitLab discovery options and canonical service observations contain no credentials. */
export type { GitlabTarget, GitlabSelection } from "./resolution/gitlab-url.js";

/** Compare effective Git fetch/push URLs against an already selected GitLab target. */
export { parseGitlabTarget } from "./resolution/gitlab-url.js";
