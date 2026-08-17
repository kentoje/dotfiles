import { Context, type Effect, type Option, Schema } from "effect";

/** An open merge request for the current Git branch. */
export interface CurrentBranchMergeRequest {
  readonly iid: number;
}

/** A GitLab lookup failure that must block MR creation rather than permit duplicates. */
export class GitLabMergeRequestLookupError extends Schema.TaggedError<GitLabMergeRequestLookupError>()(
  "GitLabMergeRequestLookupError",
  { message: Schema.String },
) {}

/** Looks up the current branch's open merge request through the active GitLab transport. */
export class GitLabService extends Context.Service<
  GitLabService,
  {
    readonly findOpenMergeRequestForCurrentBranch: (input: {
      readonly cwd: string;
    }) => Effect.Effect<
      Option.Option<CurrentBranchMergeRequest>,
      GitLabMergeRequestLookupError
    >;
  }
>()("pi-custom-harness/lib/gitlab/GitLabService") {}
