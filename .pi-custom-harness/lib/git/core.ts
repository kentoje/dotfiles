import { Context, type Effect, Schema } from "effect";

/** A Git lookup failure that prevents verifying the current branch's changeset. */
export class GitChangesetLookupError extends Schema.TaggedError<GitChangesetLookupError>()(
  "GitChangesetLookupError",
  { message: Schema.String },
) {}

/** Provides Git facts needed by harness policies without exposing Pi concerns. */
export class GitService extends Context.Service<
  GitService,
  {
    readonly commitsAreConventional: (input: {
      readonly cwd: string;
    }) => Effect.Effect<boolean, GitChangesetLookupError>;
    readonly hasChangesetOnCurrentBranch: (input: {
      readonly cwd: string;
    }) => Effect.Effect<boolean, GitChangesetLookupError>;
  }
>()("pi-custom-harness/lib/git/GitService") {}
