import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { runTool } from "../../lib/pi-bridge/core";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { VerifyCommandLiveLayer } from "../../lib/verify/live";
import { type VerifyReport, verify } from "./core";
import { type VerifyInput, VerifyParams } from "./schema";

/** Registers the repository-owned verification tool. */
export default function registerVerify(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "verify",
    label: "Verify",
    description: "Run repository-defined type, lint, test, or all checks",
    promptSnippet: "Run repository-defined verification checks",
    promptGuidelines: [
      "Use verify before declaring a change complete; choose all for the complete repository check list.",
    ],
    parameters: VerifyParams,
    async execute(_toolCallId, params: VerifyInput, signal, _onUpdate, ctx) {
      const effect = verify({ ...params, cwd: ctx.cwd }).pipe(
        Effect.provide(RepoMapLiveLayer),
        Effect.provide(VerifyCommandLiveLayer),
        Effect.map(
          (
            report,
          ): {
            content: Array<{ type: "text"; text: string }>;
            details: VerifyReport;
          } => ({
            content: [{ type: "text", text: JSON.stringify(report) }],
            details: report,
          }),
        ),
      );
      return runTool(effect, {
        signal,
        failurePrefix: "Verify",
        failureResult: (reason) => ({
          content: [{ type: "text", text: reason }],
          details: {
            ok: false,
            failures: [{ file: "", line: 0, rule: "verify", message: reason }],
            duration: 0,
          } satisfies VerifyReport,
        }),
      });
    },
  });
}
