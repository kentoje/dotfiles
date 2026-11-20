import { checkCommitAndPush, matchesShipMr } from "../delivery/deliver.js";
import type { ShipObservation, ShipReply } from "../invocation/ports.js";
import {
  recordShipEffect,
  requireShipActive,
  ShipFailureError,
} from "../invocation/state.js";
import type { ShipRun } from "../invocation/state.js";

const pending = new Set([
  "created",
  "waiting_for_resource",
  "preparing",
  "pending",
  "running",
  "scheduled",
]);

async function observeShipHead(run: ShipRun, iid: number) {
  const { host, target, state, invocation } = run;
  requireShipActive(invocation);
  const observation = await host.observe(target, iid, state.head, invocation);
  if (observation.mr.iid !== iid || !matchesShipMr(run, observation.mr)) {
    throw new ShipFailureError(
      "TARGET_MISMATCH",
      "The selected MR or base changed.",
      String(iid)
    );
  }
  state.mr = observation.mr;
  state.pipeline = observation.pipeline;
  return observation;
}
async function waitForShipCi(run: ShipRun) {
  requireShipActive(run.invocation);
  if (run.state.polls >= run.maxPolls) {
    throw new ShipFailureError(
      "CI_UNAVAILABLE",
      "Current-head review or CI did not become available within the polling limit."
    );
  }
  run.state.polls += 1;
  await run.host.wait(run.invocation);
}
const isCurrent = (snapshot: ShipObservation, head: string) =>
  snapshot.mr.head_sha === head && snapshot.pipeline?.sha === head;
type ShipReviewState = "continue" | "decide" | "ready";
async function awaitShipSnapshot(run: ShipRun, iid: number) {
  const snapshot = await observeShipHead(run, iid);
  if (snapshot.mr.head_sha !== run.state.head || !snapshot.complete) {
    await waitForShipCi(run);
    return { snapshot, status: "continue" satisfies ShipReviewState };
  }
  if (snapshot.threads.length) {
    return { snapshot, status: "decide" satisfies ShipReviewState };
  }
  if (
    !isCurrent(snapshot, run.state.head) ||
    !snapshot.pipeline ||
    pending.has(snapshot.pipeline.state)
  ) {
    await waitForShipCi(run);
    return { snapshot, status: "continue" satisfies ShipReviewState };
  }
  return {
    snapshot,
    status: (snapshot.pipeline.state === "success" &&
    snapshot.requiredJobsReady === true
      ? "ready"
      : "decide") satisfies ShipReviewState,
  };
}
async function applyShipReply(
  run: ShipRun,
  iid: number,
  observation: ShipObservation,
  decision: ShipReply
) {
  const { host, target, state, invocation } = run;

  if (
    !observation.threads.some((thread) => thread.id === decision.threadId) ||
    !decision.body.trim() ||
    /^\s*\/[a-z]/imu.test(decision.body)
  ) {
    throw new ShipFailureError(
      "REVIEW_DECISION_REQUIRED",
      "Choose a visible unresolved thread and supply a concrete rationale."
    );
  }
  const reply = await host.reply(
    { ...target, head: state.head },
    iid,
    decision,
    invocation
  );
  recordShipEffect(run, "reply", reply);
  if (decision.disposition === "declined") {
    throw new ShipFailureError(
      "REVIEW_DECISION_REQUIRED",
      decision.body,
      decision.threadId
    );
  }
}
async function applyShipDecision(
  run: ShipRun,
  iid: number,
  observation: ShipObservation
) {
  const { host, target, state, input, invocation } = run;
  const { pipeline } = observation;
  let transient = false;
  if (!observation.threads.length && pipeline?.state === "failed") {
    transient = (await host.transient?.(target, pipeline, invocation)) ?? false;
  }
  requireShipActive(invocation);
  const ciReason = transient ? "transient" : "ci";
  const reason = observation.threads.length ? "review" : ciReason;
  const decision = await host.decide(observation, reason, invocation);
  requireShipActive(invocation);
  if (decision.kind === "reply") {
    await applyShipReply(run, iid, observation, decision);
    return;
  }
  if (decision.kind === "stop") {
    const thread = observation.threads.at(0);
    throw new ShipFailureError(
      thread ? "REVIEW_DECISION_REQUIRED" : "CI_UNAVAILABLE",
      thread
        ? "An unresolved discussion needs an explicit decision."
        : "Required CI or its job evidence did not pass and needs diagnosis.",
      thread?.id ?? null
    );
  }
  if (state.rounds >= (input.max_fix_rounds ?? 3)) {
    throw new ShipFailureError(
      "REPAIR_LIMIT",
      "The configured repair or retry limit was reached."
    );
  }
  state.rounds += 1;
  if (decision.kind === "repair") {
    await checkCommitAndPush(run, true);
    return;
  }
  if (transient && pipeline && host.retry) {
    const reference = await host.retry(
      { ...target, head: state.head },
      pipeline,
      invocation
    );
    recordShipEffect(run, "retry", reference);
    return;
  }
  throw new ShipFailureError(
    "CI_UNAVAILABLE",
    "Only a diagnosed transient current-head pipeline can be retried here."
  );
}
export async function driveShipReadiness(run: ShipRun, iid: number) {
  let decisions = 0;
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- Fresh evidence is acquired serially after every effect.
    const { snapshot, status } = await awaitShipSnapshot(run, iid);
    if (status === "continue") {
      continue;
    }
    if (status === "decide") {
      decisions += 1;
      if (decisions > 40) {
        throw new ShipFailureError(
          "REPAIR_LIMIT",
          "The bounded review decision limit was reached."
        );
      }
      // oxlint-disable-next-line no-await-in-loop -- Decisions can update the active head and invalidate observations.
      await applyShipDecision(run, iid, snapshot);
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- A final fresh, complete observation is required immediately before mark-ready.
    const final = await observeShipHead(run, iid);
    if (
      !isCurrent(final, run.state.head) ||
      !final.complete ||
      final.threads.length ||
      final.pipeline?.state !== "success" ||
      final.requiredJobsReady !== true
    ) {
      // oxlint-disable-next-line no-await-in-loop -- The original deadline and poll limit are preserved.
      await waitForShipCi(run);
      continue;
    }
    requireShipActive(run.invocation);
    if (final.mr.draft === false) {
      return final.mr;
    }
    if (final.mr.draft !== true) {
      throw new ShipFailureError(
        "MR_STATE_UNKNOWN",
        "GitLab did not report a draft state.",
        String(iid)
      );
    }
    // oxlint-disable-next-line no-await-in-loop -- This successful mark-ready is the final effect of the invocation.
    const marked = await run.host.markReady(
      run.target,
      iid,
      run.state.head,
      run.invocation
    );
    if (
      marked.iid !== iid ||
      marked.head_sha !== run.state.head ||
      marked.draft !== false ||
      !matchesShipMr(run, marked)
    ) {
      throw new ShipFailureError(
        "REMOTE_STATE_UNKNOWN",
        "The ready response does not match the verified head.",
        String(iid),
        "indeterminate"
      );
    }
    recordShipEffect(run, "ready", String(iid));
    return marked;
  }
}
