import { Effect } from "effect";

import { worktreeFailure } from "../model.js";
import { runWorktreeGit } from "../process/run.js";

export interface RegisteredWorktree {
  path: string;
  branch: string | null;
  head_sha: string;
  locked: boolean;
  prunable: boolean;
  primary: boolean;
}
/** NUL-delimited records preserve spaces and newlines in registered checkout paths. */
export const readWorktreeRegistry = Effect.fn("readWorktreeRegistry")(
  function* readWorktreeRegistry(repository: string) {
    const raw = yield* runWorktreeGit(repository, [
      "worktree",
      "list",
      "--porcelain",
      "-z",
    ]);
    const records: RegisteredWorktree[] = [];
    for (const block of raw.split("\0\0").filter(Boolean)) {
      const fields = block.split("\0");
      const path = fields
        .find((field) => field.startsWith("worktree "))
        ?.slice(9);
      const sha = fields.find((field) => field.startsWith("HEAD "))?.slice(5);
      if (!path || !sha) {
        return yield* worktreeFailure(
          "LOOKUP_FAILED",
          "Git returned an incomplete worktree record."
        );
      }
      records.push({
        branch:
          fields.find((field) => field.startsWith("branch "))?.slice(18) ??
          null,
        head_sha: sha,
        locked: fields.some(
          (field) => field === "locked" || field.startsWith("locked ")
        ),
        path,
        primary: records.length === 0,
        prunable: fields.some(
          (field) => field === "prunable" || field.startsWith("prunable ")
        ),
      });
    }
    return records;
  }
);
