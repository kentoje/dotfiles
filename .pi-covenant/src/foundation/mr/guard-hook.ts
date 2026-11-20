import { isAbsolute } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import {
  makeMrCreationGuard,
  parseDirectMrCreation,
} from "../../mr-guard/module-port.js";
import { makeMrModule } from "../../mr/module-port.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { createPiMrHost } from "./host.js";
import { loadMrDeliveryPolicy, readMrBranchEvidence } from "./policy.js";

const grammar =
  "`glab mr create --repo https://HOST/GROUP/PROJECT --source-branch SOURCE --target-branch TARGET --title TITLE` with optional literal `cd PATH &&`.";
/** The guard is opt-in and runs only before supported Pi Bash creation calls. */
export function registerMrGuardHook(
  pi: Pick<ExtensionAPI, "on">,
  options: PiHarnessOptions
) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash" || typeof event.input.command !== "string") {
      return;
    }
    const parsed = parseDirectMrCreation(event.input.command);
    if (parsed.kind === "ignore") {
      return;
    }
    if (
      parsed.kind !== "checked" ||
      process.env.GITLAB_HEAD_REPO ||
      (parsed.input.cwd && !isAbsolute(parsed.input.cwd) && process.env.CDPATH)
    ) {
      return {
        block: true,
        reason: `MR creation context is unresolved. Use ${grammar}`,
      };
    }
    const config = options.gitlab;
    if (!config) {
      return {
        block: true,
        reason: "MR creation guard needs trusted GitLab host configuration.",
      };
    }
    try {
      const deadline = Date.now() + 30_000;
      const signal = AbortSignal.timeout(30_000);
      const module = makeMrModule(createPiMrHost(options, ctx.cwd));
      const guard = makeMrCreationGuard({
        branchEvidence: (request, branchSignal) =>
          readMrBranchEvidence(
            request,
            { cwd: ctx.cwd, gitlabHost: config.host },
            branchSignal
          ),
        policy: (repository) =>
          loadMrDeliveryPolicy(options.mrPolicyFile, repository),
        status: (selector, branch) =>
          Effect.runPromise(
            module.status(selector, { deadline, signal }, { branch })
          ),
      });
      const result = await guard.check_creation(parsed.input, signal);
      if (result.data.decision === "allow") {
        return;
      }
      const candidates = result.data.existing_mrs
        .map((mr) => `!${mr.iid}${mr.url ? ` (${mr.url})` : ""}`)
        .join(", ");
      const reasons =
        result.data.blockers.join(", ") || "Use the existing merge request";
      return {
        block: true,
        reason: `MR creation guard: ${reasons}${candidates ? ` · ${candidates}` : ""}`,
      };
    } catch {
      return {
        block: true,
        reason: "MR creation guard could not read the selected GitLab context.",
      };
    }
  });
}
