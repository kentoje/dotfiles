import type { RetroProposal } from "../backlog/proposals.js";

export interface RetroObservation {
  reference: string;
  operation: string;
  code: string;
}
const descriptions: Readonly<Record<string, string>> = {
  fleet:
    "Keep available repository rows and show the missing comparison, manifest or service evidence for",
  gitlab:
    "Retain the selected GitLab target and show the provider prerequisite or next diagnostic for",
  jira: "Show the Jira site, operation phase and actionable field, permission or retry guidance for",
  mr: "Report the selected MR and exact missing evidence or remaining review action for",
  project_cli:
    "Surface the failing selected check with its repository command and exit status for",
  worktree:
    "Show the examined worktree path and the exact prerequisite that blocked",
};
export function proposeObservedRetro(
  observations: readonly RetroObservation[],
  obligations: readonly string[],
  focus?: string
) {
  const groups = new Map<string, RetroProposal>();
  const query = focus?.trim().toLowerCase();
  for (const { code, operation, reference } of observations.slice(-100)) {
    const guidance = descriptions[operation];
    const repeated = code === "REPEATED_LOOKUPS";
    const title = repeated
      ? `Consolidate repeated ${operation} lookups`
      : `Clarify ${operation} ${code} outcomes`;
    if (
      typeof guidance !== "string" ||
      (query && !title.toLowerCase().includes(query))
    ) {
      continue;
    }
    const known = groups.get(title);
    if (known) {
      if (!known.evidence.includes(reference) && known.evidence.length < 20) {
        groups.set(title, {
          ...known,
          evidence: [...known.evidence, reference],
        });
      }
    } else if (groups.size < 20) {
      const prefix = `${operation.replaceAll("_", "").toUpperCase()}-`;
      groups.set(title, {
        evidence: [reference],
        proposed_behavior: repeated
          ? `Offer one read-only ${operation} summary for the related observations cited in this session.`
          : `${guidance} ${code}.`,
        related_obligations: obligations
          .filter((id) => id.startsWith(prefix))
          .slice(0, 5),
        title,
      });
    }
  }
  return [...groups.values()];
}
