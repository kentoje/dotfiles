import { createHash } from "node:crypto";

interface DuplicateCandidate {
  readonly key: string;
  readonly summary: string;
  readonly state: string;
}
interface DuplicateProposal {
  readonly site: string;
  readonly project: string;
  readonly issue_type: string;
  readonly summary: string;
  readonly candidates: readonly DuplicateCandidate[];
  readonly complete: boolean;
}

function normalizeJiraSummary(summary: string) {
  return summary
    .normalize("NFKC")
    .replaceAll(/\s+/gu, " ")
    .trim()
    .toLowerCase();
}

/** Evaluate exact visible duplicates without transport or access to authorization. */
export function evaluateJiraDuplicates(input: DuplicateProposal) {
  const normalized = normalizeJiraSummary(input.summary);
  const matches = input.candidates
    .filter(({ summary }) => normalizeJiraSummary(summary) === normalized)
    .toSorted((a, b) => (a.key < b.key ? -1 : Number(a.key > b.key)));
  const identity = createHash("sha256")
    .update(
      JSON.stringify([
        input.site,
        input.project,
        input.issue_type,
        input.summary,
        input.complete,
        matches.map(({ key, state, summary }) => [key, state, summary]),
      ])
    )
    .digest("hex");
  const matchDecision = matches.length
    ? "duplicate_decision_required"
    : "proceed";
  const data = {
    decision: input.complete ? matchDecision : "blocked",
    matches: matches.map(({ key }) => key),
    proposal_identity: identity,
  };
  return {
    completed_effects: [],
    context: { project: input.project, site: input.site },
    data,
    error: input.complete
      ? null
      : {
          code: "SEARCH_INCOMPLETE",
          message: "Visible Jira project search did not complete.",
          phase: "preflight",
          retryable: false,
        },
    status: input.complete ? "ok" : "blocked",
    warnings: [],
  };
}
