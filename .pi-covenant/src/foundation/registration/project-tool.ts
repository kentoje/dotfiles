import type {
  ToolDefinition,
  ExtensionContext,
  AgentToolUpdateCallback,
} from "@earendil-works/pi-coding-agent";
import { Effect, Schema } from "effect";

import {
  inspectProjectChecks,
  runProjectChecks,
} from "../../project-cli/module-port.js";
import { resolveProjectContext } from "../../repository-context/module-port.js";
import {
  piBoundaryFailure,
  piInvocationDeadline,
  piToolResult,
  requirePiInvocationActive,
} from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import {
  projectToolParameters,
  projectToolRequest,
} from "../invocation/parameters.js";
import {
  renderPiDetails,
  renderProjectCheckReport,
} from "../invocation/render.js";
import {
  invokeProjectCapability,
  invokeProjectProfile,
} from "./project-profile.js";
import type { ProjectToolConfirmation } from "./project-profile.js";

/** Thin project tool adapter preserves the repository runner's report and complete exit semantics. */
export function createProjectCheckTool(options: PiHarnessOptions) {
  return {
    description:
      "Inspect discovered checks, run the selected mandatory project suite, or propose and maintain an approved check profile. E2E/build remain project-specific. keep_going retains failures while attempting later checks.",
    async execute(
      _id: string,
      input: unknown,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      ctx: Pick<ExtensionContext, "cwd"> & ProjectToolConfirmation
    ) {
      try {
        const deadline = piInvocationDeadline(options);
        requirePiInvocationActive(signal, deadline);
        const request = Schema.decodeUnknownSync(projectToolRequest, {
          onExcessProperty: "error",
        })(input);
        onUpdate?.(
          piToolResult(
            { stage: "context" },
            false,
            "Resolving project context."
          )
        );
        const context = await resolveProjectContext(
          request.project ? { cwd: request.project } : {},
          { sessionCwd: ctx.cwd }
        );
        if (!context.data) {
          throw new Error(
            context.error?.message ?? "PI_CONTEXT: project unavailable."
          );
        }
        requirePiInvocationActive(signal, deadline);
        const invocation = {
          ctx,
          deadline,
          project: context.data.project_root,
          signal,
        };
        if (request.action === "execute_capability") {
          return await invokeProjectCapability(request, invocation);
        }
        if (
          request.action === "propose" ||
          request.action === "maintain" ||
          request.action === "create"
        ) {
          return await invokeProjectProfile(request, invocation);
        }
        const { action, project: _project, ...args } = request;
        const selected = { ...args, project: context.data.project_root };
        onUpdate?.(
          piToolResult(
            { project: context.data.project_root, stage: action },
            false,
            action === "check"
              ? "Running selected project checks."
              : "Inspecting project check commands."
          )
        );
        if (action === "inspect") {
          const plan = await Effect.runPromise(inspectProjectChecks(selected));
          requirePiInvocationActive(signal, deadline);
          return piToolResult(
            plan,
            false,
            renderPiDetails(
              `Selected ${plan.checks.length} checks in ${plan.project}.`,
              plan
            )
          );
        }
        const report = await Effect.runPromise(
          runProjectChecks(selected, {
            deadline,
            onProgress: (progress) =>
              onUpdate?.(
                piToolResult(
                  { ...progress, project: selected.project },
                  false,
                  progress.stage === "check_started"
                    ? `Running ${progress.check_id} (${progress.index}/${progress.total}).`
                    : `${progress.check_id}: ${progress.status}.`
                )
              ),
            ...(signal ? { signal } : {}),
          })
        );
        return piToolResult(
          report,
          report.exit_code !== 0,
          renderProjectCheckReport(report)
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "Project checks",
    name: "project_cli",
    parameters: projectToolParameters,
    promptSnippet:
      "Discover and run the selected repository verification checks.",
  } satisfies ToolDefinition<typeof projectToolParameters, unknown>;
}
