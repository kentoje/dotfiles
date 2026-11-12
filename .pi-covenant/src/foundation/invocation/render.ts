import type { ProjectCheckReport } from "../../project-cli/module-port.js";
/** Bound model-visible result text independently from the unchanged structured details. */
export function renderPiDetails(summary: string, details: unknown) {
  const text = `${summary}\n${JSON.stringify(details, null, 2)}`;
  return text.length <= 16_384
    ? text
    : `${text.slice(0, 16_384)}\n[Display truncated; structured details retain the complete module result.]`;
}
/** Show every selected check status before bounded diagnostic tails, so late failures remain visible. */
export function renderProjectCheckReport(report: ProjectCheckReport) {
  const statuses = report.checks
    .map(
      (check) =>
        `${check.id}: ${check.status} (exit ${check.code ?? "unavailable"})`
    )
    .join("\n");
  const diagnostics = report.checks
    .filter((check) => check.status !== "passed")
    .map(
      (check) =>
        `${check.id}:\n${check.stderr.slice(-1500)}\n${check.stdout.slice(-1500)}`
    )
    .join("\n");
  return renderPiDetails(
    `${report.outcome}: selected checks in ${report.project}\n${statuses}`,
    { diagnostic: report.diagnostic, diagnostic_tails: diagnostics }
  );
}
