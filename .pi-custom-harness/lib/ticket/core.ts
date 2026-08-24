import { Context, type Effect, Schema } from "effect";

/** The validated ticket association stored for one worktree. */
export interface TicketBinding {
  readonly ticketKey: string;
  readonly branch: string;
  readonly worktree: string;
}

/** A ticket key failed Jira's project-key and issue-number shape. */
export class TicketKeyValidationError extends Schema.TaggedError<TicketKeyValidationError>()(
  "TicketKeyValidationError",
  { ticketKey: Schema.String },
) {}

/** The current worktree has no ticket association. */
export class TicketBindingMissingError extends Schema.TaggedError<TicketBindingMissingError>()(
  "TicketBindingMissingError",
  { worktree: Schema.String },
) {}

/** The worktree association file exists but cannot be trusted. */
export class TicketBindingMalformedError extends Schema.TaggedError<TicketBindingMalformedError>()(
  "TicketBindingMalformedError",
  { worktree: Schema.String, message: Schema.String },
) {}

/** The requested worktree no longer exists. */
export class TicketWorktreeDeletedError extends Schema.TaggedError<TicketWorktreeDeletedError>()(
  "TicketWorktreeDeletedError",
  { worktree: Schema.String },
) {}

/** The branch could not be resolved for the worktree association. */
export class TicketBranchLookupError extends Schema.TaggedError<TicketBranchLookupError>()(
  "TicketBranchLookupError",
  { worktree: Schema.String, message: Schema.String },
) {}

/** The association could not be persisted. */
export class TicketBindingWriteError extends Schema.TaggedError<TicketBindingWriteError>()(
  "TicketBindingWriteError",
  { worktree: Schema.String, message: Schema.String },
) {}

export type TicketStateError =
  | TicketKeyValidationError
  | TicketBindingMissingError
  | TicketBindingMalformedError
  | TicketWorktreeDeletedError
  | TicketBranchLookupError
  | TicketBindingWriteError;

/** State operations used by the ticket policy; the live layer owns filesystem and Git details. */
export class TicketService extends Context.Service<
  TicketService,
  {
    readonly bind: (input: {
      readonly cwd: string;
      readonly ticketKey: string;
    }) => Effect.Effect<TicketBinding, TicketStateError>;
    readonly current: (input: {
      readonly cwd: string;
    }) => Effect.Effect<TicketBinding, TicketStateError>;
  }
>()("pi-custom-harness/lib/ticket/TicketService") {}
