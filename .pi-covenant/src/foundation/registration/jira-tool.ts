import type {
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { Type } from "typebox";

import { makeJiraModule } from "../../jira/module-port.js";
import { resolveProjectContext } from "../../repository-context/module-port.js";
import { validateToolBoundary } from "../../tool-protocol/module-port.js";
import {
  piBoundaryFailure,
  piInvocationDeadline,
  piToolResult,
  requirePiInvocationActive,
} from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { renderPiDetails } from "../invocation/render.js";
import { createJiraWriteCoordinator } from "../jira/coordination.js";
import { createJiraCloudHost } from "../jira/transport.js";

const parameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal("get"),
      Type.Literal("search"),
      Type.Literal("create"),
      Type.Literal("update"),
      Type.Literal("comment"),
      Type.Literal("transition"),
    ]),
    body: Type.Optional(Type.String()),
    cursor: Type.Optional(Type.String()),
    fields: Type.Optional(
      Type.Union([
        Type.Array(Type.String()),
        Type.Record(Type.String(), Type.Unknown()),
      ])
    ),
    issue_type: Type.Optional(Type.String()),
    key: Type.Optional(Type.String()),
    page_size: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
    project: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    site: Type.Optional(Type.String()),
    summary: Type.Optional(Type.String()),
    transition: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

export function createJiraTool(options: PiHarnessOptions) {
  const acquireWrite = createJiraWriteCoordinator();
  return {
    description:
      "Get or search Jira Cloud issues. Create, update, comment and transition require trusted Pi confirmation of the exact request. Creation checks visible project duplicates first.",
    async execute(
      _id,
      input: unknown,
      signal,
      _onUpdate,
      ctx: Pick<ExtensionContext, "hasUI"> &
        Partial<Pick<ExtensionContext, "cwd">> & {
          ui: Pick<ExtensionContext["ui"], "confirm">;
        }
    ) {
      try {
        if (!options.jira) {
          throw new Error(
            "JIRA_CONFIG: set the Jira site, email and credential file in host configuration."
          );
        }
        if (!validateToolBoundary(parameters, input)) {
          throw new Error(
            "JIRA_INPUT: invalid public Jira action or arguments."
          );
        }
        const deadline = piInvocationDeadline(options);
        requirePiInvocationActive(signal, deadline);
        const host = await createJiraCloudHost(options.jira);
        const jira = makeJiraModule({
          ...host,
          acquireWrite,
          confirm: (target, confirmationSignal) => {
            if (!ctx.hasUI || confirmationSignal.aborted) {
              return Promise.resolve(false);
            }
            const proposal = JSON.stringify(target, null, 2);
            if (Buffer.byteLength(proposal) > 65_536) {
              return Promise.resolve(false);
            }
            return ctx.ui.confirm(`Authorize Jira ${target.action}`, proposal, {
              signal: confirmationSignal,
              timeout: Math.max(1, Math.min(60_000, deadline - Date.now())),
            });
          },
        });
        const { action, ...args } = input;
        const context =
          !args.project &&
          ctx.cwd &&
          (action === "create" || action === "search")
            ? await resolveProjectContext({}, { sessionCwd: ctx.cwd })
            : null;
        const project = context?.data?.jira_project;
        requirePiInvocationActive(signal, deadline);
        const operation = jira[action](project ? { ...args, project } : args, {
          deadline,
          ...(signal ? { signal } : {}),
        });
        const result = await Effect.runPromise<{ status: string }, never>(
          operation
        );
        return piToolResult(
          result,
          result.status !== "ok",
          renderPiDetails(`Jira ${action}: ${result.status}`, result)
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "Jira",
    name: "jira",
    parameters,
    promptSnippet:
      "Read Jira issues and propose exact, user-confirmed Jira writes.",
  } satisfies ToolDefinition<typeof parameters, unknown>;
}
