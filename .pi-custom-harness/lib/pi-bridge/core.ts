import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Cause, Effect, Exit, Option, Result } from "effect";

import { GitChangesetLookupError } from "../git/core";
import { GitLabMergeRequestLookupError } from "../gitlab/core";
import { RepositoryFactsLookupError } from "../repo-map/core";

/** The Pi result used when a handler cannot safely complete its verification. */
export interface PiHandlerFailure {
  readonly block: true;
  readonly reason: string;
}

/** Options shared by Effect programs executed at the Pi boundary. */
export interface PiBridgeRunOptions {
  readonly signal?: AbortSignal;
  /** Prefix used to identify the operation that failed. Defaults to MR guard wording. */
  readonly failurePrefix?: string;
}

/** Options for converting a failed Effect program into a tool result. */
export interface PiToolRunOptions<TDetails> extends PiBridgeRunOptions {
  readonly failureResult: (reason: string) => AgentToolResult<TDetails>;
}

type KnownPiBoundaryError =
  | GitChangesetLookupError
  | GitLabMergeRequestLookupError
  | RepositoryFactsLookupError;

const isKnownPiBoundaryError = (
  error: unknown,
): error is KnownPiBoundaryError =>
  error instanceof GitChangesetLookupError ||
  error instanceof GitLabMergeRequestLookupError ||
  error instanceof RepositoryFactsLookupError;

const failureReason = (error: unknown, failurePrefix: string): string => {
  if (isKnownPiBoundaryError(error)) {
    if (error instanceof GitChangesetLookupError) {
      return `${failurePrefix}: Git changeset verification failed. ${error.message}`;
    }
    if (error instanceof GitLabMergeRequestLookupError) {
      return `${failurePrefix}: GitLab merge request verification failed. ${error.message}`;
    }
    return `${failurePrefix}: repository delivery policy verification failed. ${error.message}`;
  }

  if (error instanceof Error) {
    return `${failurePrefix}: guard failed unexpectedly. ${error.message}`;
  }

  return `${failurePrefix}: guard failed unexpectedly. ${String(error)}`;
};

const failureReasonFromCause = <E>(
  cause: Cause.Cause<E>,
  failurePrefix: string,
): string => {
  if (Cause.hasInterruptsOnly(cause)) {
    return `${failurePrefix}: guard verification was interrupted before it completed. Retry the command.`;
  }

  const typedError = Cause.findErrorOption(cause);
  if (Option.isSome(typedError)) {
    return failureReason(typedError.value, failurePrefix);
  }

  const defect = Cause.findDefect(cause);
  if (Result.isSuccess(defect)) {
    return failureReason(defect.success, failurePrefix);
  }

  return failureReason(Cause.squash(cause), failurePrefix);
};

/** Runs an Effect handler and converts every failure into a fail-closed Pi result. */
export const runHandler = async <A, E>(
  effect: Effect.Effect<A, E>,
  options: PiBridgeRunOptions = {},
): Promise<A | PiHandlerFailure> => {
  const failurePrefix = options.failurePrefix ?? "MR creation blocked";
  try {
    const exit = await Effect.runPromiseExit(effect, {
      signal: options.signal,
    });
    return Exit.match(exit, {
      onSuccess: (value) => value,
      onFailure: (cause) => ({
        block: true,
        reason: failureReasonFromCause(cause, failurePrefix),
      }),
    });
  } catch (error) {
    return {
      block: true,
      reason: failureReason(error, failurePrefix),
    };
  }
};

/** Runs an Effect tool and converts typed failures, defects, and aborts into its result shape. */
export const runTool = async <TDetails, E>(
  effect: Effect.Effect<AgentToolResult<TDetails>, E>,
  options: PiToolRunOptions<TDetails>,
): Promise<AgentToolResult<TDetails>> => {
  const failurePrefix = options.failurePrefix ?? "MR creation blocked";
  try {
    const exit = await Effect.runPromiseExit(effect, {
      signal: options.signal,
    });
    return Exit.match(exit, {
      onSuccess: (value) => value,
      onFailure: (cause) =>
        options.failureResult(failureReasonFromCause(cause, failurePrefix)),
    });
  } catch (error) {
    return options.failureResult(failureReason(error, failurePrefix));
  }
};
