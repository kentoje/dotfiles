import { Effect, Schema } from "effect";

import type { gitlabCiInputs } from "../ci/read.js";
import {
  decodeGitlabObservation,
  gitlabOperationRequest,
  requireGitlabReply,
} from "../invocation/operation.js";
import type { GitlabOperation } from "../invocation/operation.js";
import { decodeGitlabPage } from "../pagination/cursor.js";
import { gitlabId } from "../transport/ci-request.js";

const decodeMatches = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      iid: gitlabId,
      sha: Schema.NonEmptyString,
      source_branch: Schema.NonEmptyString,
      source_project_id: gitlabId,
      state: Schema.NonEmptyString,
      web_url: Schema.NonEmptyString,
    })
  )
);
/** Verify MR absence only after complete, bounded traversal of the selected project's opened MRs. */
export const lookupGitlabOpenMrs = Effect.fn("lookupGitlabOpenMrs")(
  function* lookupGitlabOpenMrs(
    args: typeof gitlabCiInputs.lookup_open_mrs.Type,
    op: GitlabOperation
  ) {
    const matches = new Map<
      number,
      { iid: number; head_sha: string; url: string }
    >();
    const projectId = op.context.project_id;
    let page = 1;
    while (page <= 100) {
      const wire = yield* gitlabOperationRequest(op, {
        branch: args.source_branch,
        kind: "mergeRequests",
        page,
        pageSize: 100,
        projectId,
      }).pipe(Effect.flatMap(requireGitlabReply));
      const currentPage = page;
      const { items, next } = yield* decodeGitlabObservation(() => {
        const decoded = decodeGitlabPage(wire, currentPage, 100);
        return { items: decodeMatches(decoded.rows), next: decoded.next };
      });
      for (const mr of items) {
        if (
          mr.state === "opened" &&
          mr.source_project_id === projectId &&
          mr.source_branch === args.source_branch
        ) {
          if (matches.has(mr.iid)) {
            return yield* Effect.fail(new Error("INCOMPLETE_PAGINATION"));
          }
          matches.set(mr.iid, {
            head_sha: mr.sha,
            iid: mr.iid,
            url: mr.web_url,
          });
        }
      }
      if (next === null) {
        return { complete: true, matches: [...matches.values()] };
      }
      page = next;
    }
    return yield* Effect.fail(new Error("SCAN_LIMIT"));
  }
);
