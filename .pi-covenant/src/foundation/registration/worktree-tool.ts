import type {
  ToolDefinition,
  AgentToolUpdateCallback,
} from "@earendil-works/pi-coding-agent";
import { Effect, Schema } from "effect";

import { resolveProjectContext } from "../../repository-context/module-port.js";
import type { WorktreeResult } from "../../worktree/module-port.js";
import { makeWorktreeModule } from "../../worktree/module-port.js";
import { loadWorktreeHost } from "../configuration/host-config.js";
import {
  piBoundaryFailure,
  piInvocationDeadline,
  piToolResult,
  requirePiInvocationActive,
} from "../invocation/lifecycle.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import {
  worktreeToolParameters,
  worktreeToolRequest,
} from "../invocation/parameters.js";
import { renderPiDetails } from "../invocation/render.js";
/** Worktree dispatch uses explicitly trusted host setup and retains partial committed effects verbatim. */
export function createWorktreeTool(options: PiHarnessOptions) {
  return {
    description:
      "Create, inspect, list or remove managed worktrees using explicitly configured host setup. Removal is conservative and retains branches.",
    async execute(
      _id: string,
      input: unknown,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<unknown> | undefined,
      ctx: { cwd: string }
    ) {
      try {
        const deadline = piInvocationDeadline(options);
        requirePiInvocationActive(signal, deadline);
        const request = Schema.decodeUnknownSync(worktreeToolRequest, {
          onExcessProperty: "error",
        })(input);
        onUpdate?.(
          piToolResult(
            { stage: "context" },
            false,
            "Resolving repository and worktree configuration."
          )
        );
        const context = await resolveProjectContext(
          {
            ...(request.cwd ? { cwd: request.cwd } : {}),
            ...(request.repository ? { repository: request.repository } : {}),
          },
          { sessionCwd: ctx.cwd }
        );
        if (!context.data?.git_root || !context.data.repository_id) {
          throw new Error(
            context.error?.message ??
              "PI_GIT_REQUIRED: worktree requires a Git repository."
          );
        }
        const host = await loadWorktreeHost(
          options.configPath,
          context.data.git_root,
          ctx.cwd
        );
        requirePiInvocationActive(signal, deadline);
        const { action, cwd: _cwd, repository: _repository, ...args } = request;
        const module = makeWorktreeModule(host);
        const invocation = { deadline, ...(signal ? { signal } : {}) };
        onUpdate?.(
          piToolResult(
            { repository: host.repositoryPath, stage: action },
            false,
            `Running worktree ${action}; setup may run for creation.`
          )
        );
        let effect: Effect.Effect<WorktreeResult<unknown>>;
        switch (action) {
          case "new": {
            effect = module.new(args, invocation);
            break;
          }
          case "verify": {
            effect = module.verify(args, invocation);
            break;
          }
          case "rm": {
            effect = module.rm(args, invocation);
            break;
          }
          case "list": {
            effect = module.list({}, invocation);
            break;
          }
          default: {
            const exhaustive: never = action;
            throw new Error(`PI_ACTION: unsupported action ${exhaustive}`);
          }
        }
        const result = await Effect.runPromise(effect);
        return piToolResult(
          result,
          result.status !== "ok",
          renderPiDetails(
            `Worktree ${action}: ${result.status}. ${result.completed_effects.length} effects recorded.`,
            result
          )
        );
      } catch (error) {
        return piBoundaryFailure(error);
      }
    },
    label: "Managed worktrees",
    name: "worktree",
    parameters: worktreeToolParameters,
    promptSnippet:
      "Manage task worktrees with repository-specific host configuration.",
  } satisfies ToolDefinition<typeof worktreeToolParameters, unknown>;
}
