import type {
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { makeGitlabModule } from "../../gitlab/module-port.js";
import { createConfiguredGitlabTransport } from "../gitlab/configured.js";
import { acquireGitlabPipelineMutation } from "../gitlab/coordination.js";
import {
  piBoundaryFailure,
  piInvocationDeadline,
  piToolResult,
} from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { renderPiDetails } from "../invocation/render.js";

const parameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal("repository"),
      Type.Literal("pipelines"),
      Type.Literal("pipeline"),
      Type.Literal("jobs"),
      Type.Literal("job"),
      Type.Literal("logs"),
      Type.Literal("retry"),
      Type.Literal("cancel"),
    ]),
    cursor: Type.Optional(Type.String()),
    cwd: Type.Optional(Type.String()),
    include_retried: Type.Optional(Type.Boolean()),
    job_id: Type.Optional(Type.Integer()),
    max_bytes: Type.Optional(Type.Integer()),
    offset: Type.Optional(Type.Integer()),
    page_size: Type.Optional(Type.Integer()),
    pipeline_id: Type.Optional(Type.Integer()),
    ref: Type.Optional(Type.String()),
    repository: Type.Optional(Type.String()),
    sha: Type.Optional(Type.String()),
    state: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

/** Present the eight GitLab actions and obtain exact-target authority from the Pi host. */
export function createGitlabTool(options: PiHarnessOptions) {
  const acquireMutation = acquireGitlabPipelineMutation;
  const config = options.gitlab;
  const transport = config ? createConfiguredGitlabTransport(config) : null;
  return {
    description:
      "Read GitLab repository, pipeline, job or log data. Retry or cancel requires an explicitly selected repository and pipeline ID and host authorization.",
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
        if (!config || !transport) {
          throw new Error(
            "GITLAB_CONFIG: set PI_COVENANT_GITLAB_HOST and PI_COVENANT_GITLAB_CREDENTIAL_FILE to enable GitLab."
          );
        }
        if (!Value.Check(parameters, input)) {
          throw new Error(
            "GITLAB_INPUT: invalid public tool action or arguments."
          );
        }
        const module = makeGitlabModule({
          ...transport,
          acquireMutation,
          authorizeMutation: (target, invocation) =>
            Effect.tryPromise({
              catch: () => false,
              try: () =>
                ctx.hasUI
                  ? ctx.ui.confirm(
                      "Authorize GitLab pipeline operation",
                      `${target.action} pipeline ${target.pipelineId} in ${target.host}/${target.repository} (project ${target.projectId})?`,
                      {
                        ...(invocation.signal
                          ? { signal: invocation.signal }
                          : {}),
                        timeout: Math.max(
                          1,
                          (invocation.deadline ?? Date.now()) - Date.now()
                        ),
                      }
                    )
                  : Promise.resolve(false),
            }).pipe(Effect.orElseSucceed(() => false)),
          selection: { allowedHosts: [config.host] },
          sessionCwd: ctx.cwd,
        });
        const { action, ...args } = input;
        const operation = module[action](args, {
          deadline: piInvocationDeadline(options),
          ...(signal ? { signal } : {}),
        });
        const result = await Effect.runPromise<{ status: string }, never>(
          operation
        );
        return piToolResult(
          result,
          result.status !== "ok",
          renderPiDetails(`GitLab ${action}: ${result.status}`, result)
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "GitLab",
    name: "gitlab",
    parameters,
    promptSnippet:
      "Inspect GitLab CI and request authorized pipeline retry or cancellation.",
  } satisfies ToolDefinition<typeof parameters, unknown>;
}
