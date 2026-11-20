import type {
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { makeMrModule } from "../../mr/module-port.js";
import {
  piBoundaryFailure,
  piInvocationDeadline,
  piToolResult,
  requirePiInvocationActive,
} from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { renderPiDetails } from "../invocation/render.js";
import { createPiMrHost } from "../mr/host.js";

const parameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal("status"),
      Type.Literal("threads"),
      Type.Literal("reply"),
      Type.Literal("update"),
    ]),
    body: Type.Optional(Type.String()),
    cursor: Type.Optional(Type.String()),
    cwd: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    iid: Type.Optional(Type.Integer()),
    include_resolved: Type.Optional(Type.Boolean()),
    page_size: Type.Optional(Type.Integer()),
    repository: Type.Optional(Type.String()),
    resolve: Type.Optional(Type.Boolean()),
    thread_id: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

export function createMrTool(options: PiHarnessOptions) {
  const writes = new Set<string>();
  return {
    description:
      "Inspect a GitLab merge request and its discussions, reply to a named thread, or update explicit title or description fields. Writes require trusted Pi confirmation.",
    async execute(
      _id,
      input: unknown,
      signal,
      _onUpdate,
      ctx: Pick<ExtensionContext, "cwd" | "hasUI"> & {
        ui: Pick<ExtensionContext["ui"], "confirm">;
      }
    ) {
      try {
        if (!Value.Check(parameters, input)) {
          throw new Error("MR_INPUT: invalid MR action or arguments.");
        }
        const deadline = piInvocationDeadline(options);
        requirePiInvocationActive(signal, deadline);
        const module = makeMrModule({
          ...createPiMrHost(options, ctx.cwd),
          acquireWrite: (key) => {
            if (writes.has(key)) {
              return null;
            }
            writes.add(key);
            return () => {
              writes.delete(key);
            };
          },
          authorize: (target, invocationSignal) =>
            ctx.hasUI
              ? ctx.ui.confirm(
                  `Authorize MR ${target.action}`,
                  JSON.stringify(target, null, 2),
                  {
                    signal: invocationSignal,
                    timeout: Math.max(
                      1,
                      Math.min(60_000, deadline - Date.now())
                    ),
                  }
                )
              : Promise.resolve(false),
        });
        const { action, ...args } = input;
        const result = await Effect.runPromise<{ status: string }, never>(
          module[action](args, { deadline, ...(signal ? { signal } : {}) })
        );
        return piToolResult(
          result,
          result.status !== "ok",
          renderPiDetails(`MR ${action}: ${result.status}`, result)
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "Merge request",
    name: "mr",
    parameters,
    promptSnippet:
      "Inspect existing merge requests and propose exact, user-confirmed updates and replies.",
  } satisfies ToolDefinition<typeof parameters, unknown>;
}
