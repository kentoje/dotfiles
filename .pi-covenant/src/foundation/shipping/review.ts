import { Effect } from "effect";

import type { makeGitlabModule } from "../../gitlab/module-port.js";
import type { makeMrModule, MrIdentity } from "../../mr/module-port.js";
import { ShipFailureError } from "../../shipping/module-port.js";
import type {
  ShipHost,
  ShipInvocation,
  ShipTarget,
} from "../../shipping/module-port.js";

type MrModule = ReturnType<typeof makeMrModule>;
type GitlabModule = ReturnType<typeof makeGitlabModule>;

export function requireShipResult<D>(
  result: {
    status: string;
    data: D | null;
    error: { code: string; message: string } | null;
    completed_effects?: readonly {
      phase: string;
      target: string;
      outcome: string;
      reference?: string | null;
    }[];
  },
  fallback: string
): D {
  if (result.status === "ok" && result.data !== null) {
    return result.data;
  }
  const code = result.error?.code ?? fallback;
  if (result.status === "indeterminate" || result.status === "partial") {
    const retained = (result.completed_effects ?? []).flatMap<
      ShipFailureError["retainedEffects"][number]
    >(({ phase, target, outcome, reference }) =>
      outcome === "committed" || outcome === "unknown"
        ? [{ outcome, phase, target, ...(reference ? { reference } : {}) }]
        : []
    );
    throw new ShipFailureError(
      code,
      `${code}. Inspect the remote effect before repeating the action.`,
      null,
      result.status,
      retained
    );
  }
  if (result.status === "cancelled") {
    throw new ShipFailureError(
      "CANCELLED",
      "Shipping was cancelled.",
      null,
      "cancelled"
    );
  }
  if (code === "WRITE_CONFLICT" || code === "HEAD_CHANGED") {
    throw new ShipFailureError(code, result.error?.message ?? code);
  }
  throw new ShipFailureError(fallback, result.error?.message ?? fallback);
}
async function listShipThreads(
  mr: MrModule,
  selector: { repository: string; iid: number },
  head: string,
  invocation: ShipInvocation
) {
  const threads = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each bounded page depends on the preceding cursor.
    const result = await Effect.runPromise(
      mr.threads(
        { ...selector, page_size: 100, ...(cursor ? { cursor } : {}) },
        invocation
      )
    );
    if (
      result.status !== "ok" ||
      result.data?.merge_request.head_sha !== head
    ) {
      break;
    }
    for (const thread of result.data.threads) {
      if (seen.has(thread.id)) {
        return { complete: false, threads: [] };
      }
      seen.add(thread.id);
      if (thread.resolvable && thread.resolved !== true) {
        threads.push({
          author: thread.author_name,
          body: thread.body,
          id: thread.id,
        });
      }
    }
    if (result.data.complete) {
      return { complete: true, threads };
    }
    cursor = result.data.next_cursor ?? undefined;
    if (!cursor) {
      break;
    }
  }
  return { complete: false, threads: [] };
}
async function readShipJobs(
  gitlab: GitlabModule,
  target: ShipTarget,
  pipeline: { id: number; sha: string },
  invocation: ShipInvocation
) {
  const jobs = [];
  const seen = new Set<number>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- A bounded full scan supplies current-attempt evidence.
    const result = await Effect.runPromise(
      gitlab.jobs(
        {
          page_size: 100,
          pipeline_id: pipeline.id,
          repository: target.repository,
          ...(cursor ? { cursor } : {}),
        },
        invocation
      )
    );
    if (result.status !== "ok" || !result.data) {
      return null;
    }
    for (const job of result.data.items) {
      if (job.sha !== pipeline.sha || seen.has(job.id)) {
        return null;
      }
      seen.add(job.id);
      jobs.push(job);
    }
    if (!result.data.has_more) {
      return jobs;
    }
    cursor = result.data.next_cursor ?? undefined;
    if (!cursor) {
      break;
    }
  }
  return null;
}
async function checkShipRequiredJobs(
  gitlab: GitlabModule,
  target: ShipTarget,
  pipeline: { id: number; sha: string },
  invocation: ShipInvocation
) {
  const jobs = await readShipJobs(gitlab, target, pipeline, invocation);
  return Boolean(
    jobs?.length &&
    jobs.every(
      (job) =>
        job.state === "success" ||
        (job.allow_failure === true &&
          ["failed", "skipped", "manual"].includes(job.state))
    )
  );
}

export function createShipObserver(
  mr: MrModule,
  gitlab: GitlabModule
): ShipHost["observe"] {
  return async (target, iid, head, invocation) => {
    const selector = { iid, repository: target.repository };
    const read = async () =>
      requireShipResult(
        await Effect.runPromise(
          mr.status(selector, invocation, {
            branch: target.branch,
            requireOpen: true,
          })
        ),
        "REVIEW_UNAVAILABLE"
      );
    const initial = await read();
    const selected = initial.merge_request;
    if (!selected) {
      throw new ShipFailureError(
        "REVIEW_UNAVAILABLE",
        "The selected MR is no longer available."
      );
    }
    if (selected.head_sha !== head) {
      return { complete: false, mr: selected, pipeline: null, threads: [] };
    }
    const review = await listShipThreads(mr, selector, head, invocation);
    const latest = await read();
    if (
      latest.merge_request?.head_sha !== head ||
      latest.pipeline?.id !== initial.pipeline?.id
    ) {
      return {
        complete: false,
        mr: latest.merge_request ?? selected,
        pipeline: null,
        threads: [],
      };
    }
    const pendingPipeline = latest.pipeline;
    if (!pendingPipeline || pendingPipeline.sha !== head) {
      return { mr: latest.merge_request, pipeline: pendingPipeline, ...review };
    }
    const verified = await Effect.runPromise(
      gitlab.pipeline(
        { pipeline_id: pendingPipeline.id, repository: target.repository },
        invocation
      )
    );
    const pipeline =
      verified.status === "ok" && verified.data?.sha === head
        ? verified.data
        : null;
    const requiredJobsReady =
      pipeline?.state === "success" &&
      (await checkShipRequiredJobs(gitlab, target, pipeline, invocation));
    return { mr: latest.merge_request, pipeline, requiredJobsReady, ...review };
  };
}
const transientReasons = new Set([
  "runner_system_failure",
  "stuck_or_timeout_failure",
  "scheduler_failure",
  "api_failure",
]);
export function diagnoseShipRetry(
  gitlab: GitlabModule
): NonNullable<ShipHost["transient"]> {
  return async (target, pipeline, invocation) => {
    const jobs = await readShipJobs(gitlab, target, pipeline, invocation);
    const retryable = jobs?.filter(
      (job) => job.state === "failed" || job.state === "canceled"
    );
    return Boolean(
      retryable?.length &&
      retryable.every(
        (job) =>
          job.state === "failed" &&
          transientReasons.has(job.failure_reason ?? "")
      )
    );
  };
}

export function shipDeliveryIdentity(
  target: ShipTarget,
  received: { iid: number; head_sha: string; draft: boolean; url?: string }
): MrIdentity {
  return {
    ...received,
    source_branch: target.branch,
    target_branch: target.targetBranch,
  };
}
