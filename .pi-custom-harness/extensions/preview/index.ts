import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { runTool } from "../../lib/pi-bridge/core";
import { makePreviewLiveRuntime } from "../../lib/preview/live";
import { RepoMapLiveLayer } from "../../lib/repo-map/live";
import { type PreviewReport, runPreview } from "./core";
import { type PreviewInput, PreviewParams } from "./schema";

const failureResult = (reason: string) => ({
  content: [{ type: "text" as const, text: reason }],
  details: {
    url: "",
    running: false,
    authMode: undefined,
    mode: undefined,
  } satisfies PreviewReport,
  isError: true,
});

/** Registers preview URL lookup and mode-aware development server startup. */
export default function registerPreviewTool(pi: ExtensionAPI): void {
  const runtime = makePreviewLiveRuntime();

  pi.on("session_shutdown", () => {
    runtime.stopAll();
  });

  pi.registerTool({
    name: "preview",
    label: "Preview",
    description:
      "Resolve the current worktree preview URL or start its repository development server.",
    promptSnippet: "Resolve or start the current worktree preview",
    promptGuidelines: [
      "Use preview url to verify the current worktree route is ready.",
      "Use preview up with sandbox, integrate, or mock only when the repository exposes that mode.",
      "When authMode is browser-login, prepare browser authentication separately; preview does not navigate or log in.",
    ],
    parameters: PreviewParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: PreviewInput, signal, _onUpdate, ctx) {
      const actionEffect = runPreview({
        cwd: ctx.cwd,
        request: params,
        sessionSignal: signal,
      }).pipe(
        Effect.provide(runtime.layer),
        Effect.provide(RepoMapLiveLayer),
        Effect.map((result) => ({
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          details: result,
        })),
      );
      return runTool(actionEffect, {
        signal,
        failurePrefix: "Preview",
        failureResult,
      });
    },
  });
}
