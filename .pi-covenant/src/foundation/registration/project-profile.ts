import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Effect } from "effect";

import {
  applyProjectProfile,
  proposeProjectProfile,
  runProjectCapability,
} from "../../project-cli/module-port.js";
import {
  piToolResult,
  requirePiInvocationActive,
} from "../invocation/lifecycle.js";
import type { projectToolRequest } from "../invocation/parameters.js";
import { renderPiDetails } from "../invocation/render.js";

/** Pi confirmation is only provided by the trusted extension context. */
export interface ProjectToolConfirmation {
  hasUI?: boolean;
  ui?: Pick<ExtensionContext["ui"], "confirm">;
}

type ProjectToolRequest = typeof projectToolRequest.Type;
interface ProjectInvocation {
  deadline: number;
  signal: AbortSignal | undefined;
  ctx: ProjectToolConfirmation;
  project: string;
}

async function confirmProjectOperation(
  invocation: ProjectInvocation,
  title: string,
  details: unknown
) {
  const { ctx, deadline, signal } = invocation;
  requirePiInvocationActive(signal, deadline);
  const prompt = JSON.stringify(details, null, 2);
  return Boolean(
    ctx.hasUI &&
    ctx.ui &&
    Buffer.byteLength(prompt) <= 65_536 &&
    (await ctx.ui.confirm(title, prompt, {
      timeout: Math.max(1, Math.min(60_000, deadline - Date.now())),
      ...(signal ? { signal } : {}),
    }))
  );
}

/** Execute a declared capability using the exact resolved command shown in Pi. */
export async function invokeProjectCapability(
  request: Extract<ProjectToolRequest, { action: "execute_capability" }>,
  invocation: ProjectInvocation
) {
  const { deadline, signal, project } = invocation;
  const report = await Effect.runPromise(
    runProjectCapability(
      {
        arguments: request.arguments,
        capability_id: request.capability_id,
        project,
      },
      {
        authorize: (target) =>
          confirmProjectOperation(
            invocation,
            "Run project capability?",
            target
          ),
        deadline,
        ...(signal ? { signal } : {}),
      }
    )
  );
  return piToolResult(
    report,
    report.outcome !== "pass",
    renderPiDetails(`Project capability ${report.outcome}.`, report)
  );
}

/** Propose, review, or save a project profile through trusted Pi confirmation. */
export async function invokeProjectProfile(
  request: Extract<
    ProjectToolRequest,
    { action: "propose" | "maintain" | "create" }
  >,
  invocation: ProjectInvocation
) {
  const { deadline, project, signal } = invocation;
  const profileInput = {
    project,
    ...(request.capabilities ? { checks: request.capabilities } : {}),
  };
  const proposal = await Effect.runPromise(proposeProjectProfile(profileInput));
  const id = "proposal_id" in request ? request.proposal_id : undefined;
  requirePiInvocationActive(signal, deadline);
  if (!id) {
    return piToolResult(
      proposal,
      false,
      renderPiDetails("Review this project check profile.", proposal)
    );
  }
  const expected = request.action === "create" ? "create" : "update";
  if (id !== proposal.proposal_id || proposal.state !== expected) {
    throw new Error(
      "PROJECT_PROFILE_STALE: review an applicable proposal before applying."
    );
  }
  if (
    !(await confirmProjectOperation(
      invocation,
      "Apply project check profile?",
      {
        checks: proposal.checks,
        path: "project-checks.json",
        project: proposal.project,
        proposal_id: id,
      }
    ))
  ) {
    throw new Error(
      "PROJECT_PROFILE_AUTH: exact profile approval is required."
    );
  }
  const result = await Effect.runPromise(
    applyProjectProfile(
      { ...profileInput, proposal_id: id },
      { deadline, ...(signal ? { signal } : {}) }
    )
  );
  return piToolResult(
    result,
    false,
    renderPiDetails(
      "Project check profile saved. Run check to verify it.",
      result
    )
  );
}
