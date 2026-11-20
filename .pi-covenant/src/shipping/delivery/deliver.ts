import type { MrIdentity } from "../../mr/module-port.js";
import {
  recordShipEffect,
  requireShipActive,
  ShipFailureError,
} from "../invocation/state.js";
import type { ShipRun } from "../invocation/state.js";

export function matchesShipMr(run: ShipRun, mr: MrIdentity) {
  return (
    mr.source_branch === run.target.branch &&
    mr.target_branch === run.target.targetBranch
  );
}
export async function checkCommitAndPush(run: ShipRun, repair: boolean) {
  const { host, target, state, input, invocation } = run;
  requireShipActive(invocation);
  const current = { ...target, head: state.head };
  const scope = await host.prepare(current, input.task_paths ?? [], invocation);
  if (repair && !scope.hasChanges) {
    throw new ShipFailureError(
      "REPAIR_SCOPE_EMPTY",
      "Apply the repair to the authorized paths before requesting a repair round."
    );
  }
  requireShipActive(invocation);
  if (!(await host.check(current, invocation))) {
    throw new ShipFailureError(
      "LOCAL_CHECK_FAILED",
      "The selected project checks did not pass."
    );
  }
  requireShipActive(invocation);
  const rechecked = await host.prepare(current, scope.paths, invocation);
  if (rechecked.fingerprint !== scope.fingerprint) {
    throw new ShipFailureError(
      "SCOPE_CHANGED",
      "Task changes changed while checks were running."
    );
  }
  const existing = await host.preflight(
    current,
    scope,
    input,
    false,
    invocation
  );
  if (existing && !matchesShipMr(run, existing)) {
    throw new ShipFailureError(
      "DUPLICATE_MR",
      "An existing branch MR targets a different base.",
      String(existing.iid)
    );
  }
  requireShipActive(invocation);
  if (scope.hasChanges) {
    const head = await host.commit(
      current,
      scope,
      input.commit_message ?? input.title ?? target.title,
      invocation
    );
    state.head = head;
    state.commits.push(head);
    recordShipEffect(run, "commit", head);
  }
  requireShipActive(invocation);
  await host.push(current, state.head, invocation);
  state.pushed = state.head;
  state.pipeline = null;
  recordShipEffect(run, "push", state.head);
  return scope;
}
export async function findOrCreateShipMr(
  run: ShipRun,
  scope: Awaited<ReturnType<typeof checkCommitAndPush>>
) {
  const { host, target, state, input, invocation } = run;
  requireShipActive(invocation);
  const existing = await host.preflight(
    { ...target, head: state.head },
    scope,
    input,
    true,
    invocation
  );
  if (existing) {
    if (!matchesShipMr(run, existing)) {
      throw new ShipFailureError(
        "DUPLICATE_MR",
        "An existing branch MR targets a different base.",
        String(existing.iid)
      );
    }
    return existing;
  }
  requireShipActive(invocation);
  let draft: MrIdentity;
  try {
    draft = await host.create(target, state.head, input, invocation);
  } catch (error) {
    if (error instanceof ShipFailureError && error.code === "WRITE_CONFLICT") {
      const raced = await host.preflight(
        { ...target, head: state.head },
        scope,
        input,
        true,
        invocation
      );
      if (raced && matchesShipMr(run, raced)) {
        return raced;
      }
    }
    throw error;
  }
  recordShipEffect(run, "draft", String(draft.iid));
  if (
    !matchesShipMr(run, draft) ||
    draft.head_sha !== state.head ||
    draft.draft !== true
  ) {
    throw new ShipFailureError(
      "REMOTE_STATE_UNKNOWN",
      "Draft acknowledgement does not match the expected branch and head.",
      String(draft.iid),
      "indeterminate"
    );
  }
  return draft;
}
