import { Context, Effect, Schema } from "effect";

/** A registered worktree matching the requested task context. */
export interface TaskPreflightWorktree {
  readonly path: string;
  readonly branch: string | undefined;
}

/** A Jira issue matching the requested task context. */
export interface TaskPreflightTicket {
  readonly key: string;
  readonly summary: string;
}

/** An open merge request matching the requested task context. */
export interface TaskPreflightMergeRequest {
  readonly iid: number;
  readonly title: string;
  readonly sourceBranch: string;
}

/** Existing resources discovered before creating task state. */
export interface TaskPreflightMatches {
  readonly worktrees: ReadonlyArray<TaskPreflightWorktree>;
  readonly tickets: ReadonlyArray<TaskPreflightTicket>;
  readonly mergeRequests: ReadonlyArray<TaskPreflightMergeRequest>;
}

/** A preflight result that says whether creation needs an explicit decision. */
export interface TaskPreflightResult extends TaskPreflightMatches {
  readonly action: "proceed" | "ask_user";
  readonly reason: string | undefined;
}

/** Resource whose creation is being checked for duplicates. */
export type TaskPreflightResource = "worktree" | "ticket" | "merge-request";

/** A task preflight lookup failed before duplicate state could be trusted. */
export class TaskPreflightError extends Schema.TaggedError<TaskPreflightError>()(
  "TaskPreflightError",
  { message: Schema.String },
) {}

/** Fakeable boundary for repository, Jira, and GitLab duplicate searches. */
export class TaskPreflightService extends Context.Service<
  TaskPreflightService,
  {
    readonly search: (input: {
      readonly cwd: string;
      readonly query: string;
    }) => Effect.Effect<TaskPreflightMatches, TaskPreflightError>;
  }
>()("pi-custom-harness/lib/task-preflight/TaskPreflightService") {}

/** Selects whether matches require confirmation for the resource being created. */
export const taskPreflightDecision = ({
  matches,
  resource,
}: {
  readonly matches: TaskPreflightMatches;
  readonly resource: TaskPreflightResource;
}): TaskPreflightResult => {
  const duplicateCount =
    resource === "worktree"
      ? matches.worktrees.length + matches.mergeRequests.length
      : resource === "ticket"
        ? matches.tickets.length
        : matches.mergeRequests.length;
  return {
    ...matches,
    action: duplicateCount > 0 ? "ask_user" : "proceed",
    reason:
      duplicateCount > 0
        ? `Existing task resources match this ${resource} request.`
        : undefined,
  };
};

/** Searches task resources and returns the explicit creation decision. */
export const preflightTaskCreation = (input: {
  readonly cwd: string;
  readonly query: string;
  readonly resource: TaskPreflightResource;
}): Effect.Effect<
  TaskPreflightResult,
  TaskPreflightError,
  TaskPreflightService
> =>
  TaskPreflightService.use((service) =>
    service
      .search({ cwd: input.cwd, query: input.query })
      .pipe(
        Effect.map((matches) =>
          taskPreflightDecision({ matches, resource: input.resource }),
        ),
      ),
  );
