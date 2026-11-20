import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { createShipCommand } from "../../shipping/module-port.js";
import type { ShipHost } from "../../shipping/module-port.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { renderPiDetails } from "../invocation/render.js";
import { createPiShipHost } from "../shipping/host.js";

const replyInput = Type.Object(
  {
    body: Type.String({ maxLength: 4000, minLength: 1, pattern: "\\S" }),
    disposition: Type.Union([
      Type.Literal("addressed"),
      Type.Literal("declined"),
    ]),
  },
  { additionalProperties: false }
);

function createPiShipDecision(
  ctx: ExtensionCommandContext
): ShipHost["decide"] {
  return async (observation, reason, invocation) => {
    if (!ctx.hasUI) {
      return { kind: "stop" };
    }
    const options = {
      signal: invocation.signal,
      timeout: Math.max(1, invocation.deadline - Date.now()),
    };
    if (reason === "transient") {
      const approved = await ctx.ui.confirm(
        "Retry diagnosed transient CI?",
        `Pipeline ${observation.pipeline?.id} on ${observation.mr.head_sha}`,
        options
      );
      return { kind: approved ? "retry" : "stop" };
    }
    const thread = observation.threads.at(0);
    const prompt = thread
      ? `${thread.author} · ${thread.id}\n${thread.body.slice(0, 3000)}\nUse JSON {"disposition":"addressed"|"declined","body":"rationale"} or type repair after editing authorized files.`
      : "Apply a fix to the authorized files, then type repair. Leave empty to return the blocker.";
    const answer = await ctx.ui.input(prompt, "repair or JSON", options);
    if (answer?.trim() === "repair") {
      return { kind: "repair" };
    }
    if (!thread || !answer) {
      return { kind: "stop" };
    }
    try {
      const decision: unknown = JSON.parse(answer);
      if (Value.Check(replyInput, decision)) {
        return { kind: "reply", threadId: thread.id, ...decision };
      }
    } catch {
      // Invalid input cannot authorize a provider mutation.
    }
    return { kind: "stop" };
  };
}

function shipCommandErrorMessage(error: unknown) {
  if (error instanceof SyntaxError) {
    return "Ship requires an optional JSON argument object.";
  }
  return error instanceof Error ? error.message : "Shipping could not start.";
}

export function registerPiShipCommand(
  pi: Pick<ExtensionAPI, "registerCommand">,
  options: PiHarnessOptions
) {
  let active: AbortController | undefined;
  pi.registerCommand("ship", {
    description:
      "Ship the current task to GitLab human review. Accepts a JSON object with task_paths and optional target_branch, title and commit_message.",
    async handler(args, ctx) {
      if (args.trim() === "cancel") {
        active?.abort();
        ctx.ui.notify(
          active
            ? "Stopping the current /ship invocation."
            : "No /ship invocation is active.",
          "info"
        );
        return;
      }
      if (active || !ctx.isIdle()) {
        ctx.ui.notify(
          "Wait for the active Pi operation before starting /ship.",
          "warning"
        );
        return;
      }
      const controller = new AbortController();
      active = controller;
      const signal = AbortSignal.any([
        controller.signal,
        ...(ctx.signal ? [ctx.signal] : []),
      ]);
      try {
        const input: unknown = args.trim() ? JSON.parse(args) : {};
        const run = createShipCommand(
          createPiShipHost(options, ctx.cwd, createPiShipDecision(ctx))
        );
        ctx.ui.setStatus("ship", "Shipping to human review");
        const result = await run(input, { signal });
        ctx.ui.notify(
          renderPiDetails(`Ship ${result.status}`, result),
          result.status === "ok" ? "info" : "warning"
        );
      } catch (error) {
        ctx.ui.notify(shipCommandErrorMessage(error), "error");
      } finally {
        ctx.ui.setStatus("ship", undefined);
        active = undefined;
      }
    },
  });
}
