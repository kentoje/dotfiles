import type {
  GitlabReadInvocation,
  GitlabWireResult,
} from "../../gitlab/module-port.js";
import { GitlabTransportError } from "./body.js";
/** Preserve caller cancellation separately from one absolute deadline and static host/input errors. */
function classifyGitlabReadFailure(
  error: unknown,
  invocation: GitlabReadInvocation,
  signal: AbortSignal,
  deadline: number
) {
  if (invocation.signal?.aborted) {
    return "CANCELLED";
  }
  if (signal.aborted || Date.now() >= deadline) {
    return "DEADLINE_EXCEEDED";
  }
  return error instanceof GitlabTransportError ? error.code : "INVALID_INPUT";
}
/** The host timer and abort bridge are released on every terminal result, including a noncooperative credential source. */
export async function runGitlabReadScope(
  invocation: GitlabReadInvocation,
  deadline: number,
  read: (signal: AbortSignal) => Promise<GitlabWireResult>,
  failure: (code: string) => GitlabWireResult
) {
  const controller = new AbortController();
  const stopped = Promise.withResolvers<GitlabWireResult>();
  const abort = () => controller.abort();
  const stop = () =>
    stopped.resolve(
      failure(
        classifyGitlabReadFailure(
          undefined,
          invocation,
          controller.signal,
          deadline
        )
      )
    );
  controller.signal.addEventListener("abort", stop, { once: true });
  invocation.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(1, deadline - Date.now()));
  try {
    return await Promise.race([read(controller.signal), stopped.promise]);
  } catch (error) {
    return failure(
      classifyGitlabReadFailure(error, invocation, controller.signal, deadline)
    );
  } finally {
    clearTimeout(timer);
    invocation.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", stop);
    controller.abort();
  }
}
