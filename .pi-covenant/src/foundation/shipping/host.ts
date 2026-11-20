import { setTimeout as delay } from "node:timers/promises";

import { Effect } from "effect";

import { makeGitlabModule } from "../../gitlab/module-port.js";
import { makeMrCreationGuard } from "../../mr-guard/module-port.js";
import { makeMrModule } from "../../mr/module-port.js";
import { runProjectChecks } from "../../project-cli/module-port.js";
import { ShipFailureError } from "../../shipping/module-port.js";
import type { ShipHost } from "../../shipping/module-port.js";
import { createConfiguredGitlabTransport } from "../gitlab/configured.js";
import { acquireGitlabPipelineMutation } from "../gitlab/coordination.js";
import type { PiHarnessOptions } from "../invocation/lifecycle.js";
import { createPiMrHost } from "../mr/host.js";
import { loadMrDeliveryPolicy } from "../mr/policy.js";
import { readShipDeliveryEvidence, resolveShipTarget } from "./context.js";
import { commitShipScope, prepareShipScope, pushShipHead } from "./git.js";
import {
  createShipObserver,
  diagnoseShipRetry,
  requireShipResult,
  shipDeliveryIdentity,
} from "./review.js";

export function createPiShipHost(
  options: PiHarnessOptions,
  cwd: string,
  decide: ShipHost["decide"]
): ShipHost {
  const config = options.gitlab;
  if (!config) {
    throw new ShipFailureError(
      "SHIP_CONFIG",
      "Configure the GitLab host and credentials before /ship."
    );
  }
  const mrHost = createPiMrHost(options, cwd);
  // Created exclusively by the user command. The review and CI ports still require explicit per-effect decisions.
  const mr = makeMrModule({
    ...mrHost,
    authorize: () => Promise.resolve(true),
  });
  const transport = createConfiguredGitlabTransport(config);
  const gitlab = makeGitlabModule({
    ...transport,
    acquireMutation: acquireGitlabPipelineMutation,
    authorizeMutation: () => Effect.succeed(true),
    selection: { allowedHosts: [config.host] },
    sessionCwd: cwd,
  });
  const transient = diagnoseShipRetry(gitlab);
  const policy = (repository: string) =>
    loadMrDeliveryPolicy(options.mrPolicyFile, repository);
  return {
    authorize: () => Promise.resolve(true),
    check: async (target, invocation) => {
      const report = await Effect.runPromise(
        runProjectChecks({ project: target.project }, invocation)
      );
      return report.exit_code === 0 && report.checks.length > 0;
    },
    commit: commitShipScope,
    create: async (target, head, input, invocation) => {
      const result = await Effect.runPromise(
        mr.create_draft(
          {
            expected_head_sha: head,
            repository: target.repository,
            source_branch: target.branch,
            target_branch: target.targetBranch,
            title: target.title,
            ...(typeof input.description === "string"
              ? { description: input.description }
              : {}),
          },
          invocation
        )
      );
      return shipDeliveryIdentity(
        target,
        requireShipResult(result, "DRAFT_CREATION_FAILED")
      );
    },
    decide,
    markReady: async (target, iid, head, invocation) => {
      const result = await Effect.runPromise(
        mr.mark_ready(
          { expected_head_sha: head, iid, repository: target.repository },
          invocation,
          { source: target.branch, target: target.targetBranch }
        )
      );
      return shipDeliveryIdentity(
        target,
        requireShipResult(result, "MARK_READY_FAILED")
      );
    },
    observe: createShipObserver(mr, gitlab),
    preflight: async (target, scope, input, pushed, invocation) => {
      const module = makeMrCreationGuard({
        branchEvidence: () =>
          readShipDeliveryEvidence(target, scope, input, pushed, invocation),
        checkPolicyOnReuse: true,
        policy,
        status: (selector, branch) =>
          Effect.runPromise(mr.status(selector, invocation, { branch })),
      });
      const result = await module.check_creation(
        {
          cwd: target.cwd,
          repository: target.repository,
          source_branch: target.branch,
          target_branch: target.targetBranch,
          title: target.title,
        },
        invocation.signal
      );
      if (result.data.decision === "blocked") {
        const code = result.error?.code ?? "DELIVERY_REQUIREMENT_FAILED";
        throw new ShipFailureError(
          code,
          `MR creation preflight blocked delivery: ${code}.`
        );
      }
      return result.data.existing_mrs[0] ?? null;
    },
    prepare: prepareShipScope,
    push: pushShipHead,
    reply: async (target, iid, decision, invocation) => {
      const selection = { iid, repository: target.repository };
      const status = requireShipResult(
        await Effect.runPromise(
          mr.status(selection, invocation, {
            branch: target.branch,
            requireOpen: true,
          })
        ),
        "REVIEW_UNAVAILABLE"
      );
      if (status.merge_request?.head_sha !== target.head) {
        throw new ShipFailureError(
          "HEAD_CHANGED",
          "The MR head changed after the review decision."
        );
      }
      const result = await Effect.runPromise(
        mr.reply(
          {
            ...selection,
            body: decision.body,
            resolve: decision.disposition === "addressed",
            thread_id: decision.threadId,
          },
          invocation
        )
      );
      const reply = requireShipResult(result, "REVIEW_REPLY_FAILED");
      if (!reply.reply_id) {
        throw new ShipFailureError(
          "REVIEW_REPLY_FAILED",
          "The reply did not return an ID."
        );
      }
      return reply.reply_id;
    },
    resolve: (input, invocation) =>
      resolveShipTarget(input, invocation, cwd, config.host, mrHost.gitlab),
    retry: async (target, pipeline, invocation) => {
      const verified = await Effect.runPromise(
        gitlab.pipeline(
          { pipeline_id: pipeline.id, repository: target.repository },
          invocation
        )
      );
      if (
        verified.status !== "ok" ||
        verified.data?.sha !== target.head ||
        verified.data.state !== "failed" ||
        !(await transient(target, verified.data, invocation))
      ) {
        throw new ShipFailureError(
          "CI_UNAVAILABLE",
          "The approved retry no longer matches diagnosed current-head CI."
        );
      }
      const result = await Effect.runPromise(
        gitlab.retry(
          { pipeline_id: pipeline.id, repository: target.repository },
          invocation
        )
      );
      requireShipResult(result, "CI_RETRY_FAILED");
      return String(pipeline.id);
    },
    transient,
    wait: async (invocation) =>
      await delay(15_000, undefined, { signal: invocation.signal }),
  };
}
