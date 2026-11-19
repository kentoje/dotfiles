/** Keep competing operations for one issue or create project from using the same stale observation. */
export function createJiraWriteCoordinator() {
  const active = new Set<string>();
  return (site: string, target: string) => {
    const key = JSON.stringify([site, target]);
    if (active.has(key)) {
      return null;
    }
    active.add(key);
    return () => {
      active.delete(key);
    };
  };
}
