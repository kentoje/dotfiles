/** Local repository context resolution performs metadata reads only, with explicit unavailable facts. */
export { resolveProjectContext } from "./resolution/resolve.js";

/** GitLab discovery options and canonical service observations contain no credentials. */
export type { GitlabTarget, GitlabSelection } from "./resolution/gitlab-url.js";
