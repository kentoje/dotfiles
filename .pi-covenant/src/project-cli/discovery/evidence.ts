import type { DiscoveredProjectCheck } from "./model.js";
import type { ProjectDiscoverySource } from "./sources.js";
import { readProjectDiscoverySources } from "./sources.js";

/** Attach deterministic bounded source references; evidence does not execute CI or interpret its conditions. */
export async function addProjectDiscoveryEvidence(
  project: string,
  checks: DiscoveredProjectCheck[],
  provided?: ProjectDiscoverySource[]
) {
  const sources = provided ?? (await readProjectDiscoverySources(project));
  for (const check of checks) {
    const evidence = new Set(check.evidence);
    for (const { file, text } of sources) {
      if (
        file.startsWith("playwright.config") &&
        check.categories.includes("e2e")
      ) {
        evidence.add(file);
      }
      if (
        (file === ".fallowrc.json" || /(?:^|\.)knip\.jsonc?$/u.test(file)) &&
        check.categories.includes("dead-code")
      ) {
        evidence.add(file);
      }
      const escaped = check.id.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      const reference = new RegExp(
        `\\b(?:pnpm|npm|yarn|bun)\\s+(?:--?[^\\s\u0060]+\\s+)*(?:run\\s+)?${escaped}(?=$|[\\s\u0060;&|])`,
        "u"
      );
      for (const [index, line] of text.split("\n").slice(0, 4096).entries()) {
        if (evidence.size >= 32) {
          break;
        }
        if (reference.test(line)) {
          evidence.add(`${file}:${index + 1}`);
        }
      }
    }
    check.evidence = [...evidence].toSorted();
  }
}
