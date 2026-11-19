import type { GitlabMutationTarget } from "../../gitlab/module-port.js";

/** A session owns its pipeline permits. Retry and cancel share the same resource key. */
export function createGitlabMutationCoordinator() {
  const active = new Set<string>();
  return (target: GitlabMutationTarget) => {
    const key = JSON.stringify([
      target.host,
      target.projectId,
      target.pipelineId,
    ]);
    if (active.has(key)) {
      return null;
    }
    active.add(key);
    let released = false;
    return () => {
      if (!released) {
        released = true;
        active.delete(key);
      }
    };
  };
}
