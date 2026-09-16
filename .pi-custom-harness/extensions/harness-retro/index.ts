import type {
  AgentToolResult,
  ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import { runTool } from "../../lib/pi-bridge/core";
import {
  type HarnessBacklogResult,
  makeHarnessRetroFollowUpText,
  runHarnessBacklog,
} from "./core";
import { HarnessBacklogLiveLayer } from "./live";
import { type HarnessBacklogInput, HarnessBacklogParams } from "./schema";

interface HarnessBacklogFailureDetails {
  readonly action: HarnessBacklogInput["action"];
  readonly error: string;
}

type HarnessBacklogToolDetails =
  | HarnessBacklogResult
  | HarnessBacklogFailureDetails;

/** Registers /harness-retro and the harness_backlog recording tool. */
export default function registerHarnessRetro(pi: ExtensionAPI): void {
  pi.registerCommand("harness-retro", {
    description:
      "Reflect on harness friction from this session and record new checklist items.",
    handler: async (args) => {
      try {
        await pi.sendMessage(
          {
            customType: "harness-retro",
            content: [
              { type: "text", text: makeHarnessRetroFollowUpText(args) },
            ],
            display: true,
            details: { focus: args.trim() },
          },
          { deliverAs: "followUp", triggerTurn: true },
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            "This extension ctx is stale after session replacement or reload.",
          )
        ) {
          return;
        }
        throw error;
      }
    },
  });

  pi.registerTool<typeof HarnessBacklogParams, HarnessBacklogToolDetails>({
    name: "harness_backlog",
    label: "Harness backlog",
    description:
      "List or record harness checklist items in docs/BACKLOG.md after checking docs/TODO.md.",
    promptSnippet:
      "List or record harness backlog checklist items after checking existing coverage.",
    promptGuidelines: [
      "Use harness_backlog after /harness-retro to list existing checklist items or record a new one.",
      "Use harness_backlog record only when the title is absent from docs/BACKLOG.md and docs/TODO.md.",
      "Record a markdown checkbox with an expect-only describe/test spec. Do not invent ticket ids or write test implementation.",
      "Do not edit docs/TODO.md from harness_backlog.",
    ],
    parameters: HarnessBacklogParams,
    executionMode: "sequential",
    async execute(_toolCallId, params: HarnessBacklogInput, signal) {
      const effect = runHarnessBacklog(params).pipe(
        Effect.provide(HarnessBacklogLiveLayer),
        Effect.map(
          (result): AgentToolResult<HarnessBacklogToolDetails> => ({
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: result,
          }),
        ),
      );
      return runTool(effect, {
        signal,
        failurePrefix: "Harness backlog",
        failureResult: (reason) => ({
          content: [{ type: "text", text: reason }],
          details: { action: params.action, error: reason },
        }),
      });
    },
  });
}
