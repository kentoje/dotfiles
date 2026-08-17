import { Context, type Effect, Schema } from "effect";

/** The release artifact a repository requires before a merge request can be opened. */
export type RepositoryReleaseGate =
  | "changeset"
  | "conventional-commits"
  | "none";

/** A repository lookup failure that must prevent an unknown release policy from being bypassed. */
export class RepositoryReleaseGateLookupError extends Schema.TaggedError<RepositoryReleaseGateLookupError>()(
  "RepositoryReleaseGateLookupError",
  { message: Schema.String },
) {}

/** Resolves the release gate owned by the repository map. */
export class RepoMapService extends Context.Service<
  RepoMapService,
  {
    readonly releaseGateFor: (input: {
      readonly cwd: string;
    }) => Effect.Effect<RepositoryReleaseGate, RepositoryReleaseGateLookupError>;
  }
>()("pi-custom-harness/lib/repo-map/RepoMapService") {}
