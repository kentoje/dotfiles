import { Effect, Schema } from "effect";

import type { gitlabCiInputs } from "../ci/read.js";
import {
  decodeGitlabObservation,
  gitlabOperationRequest,
  requireGitlabReply,
} from "../invocation/operation.js";
import type { GitlabOperation } from "../invocation/operation.js";

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const decodeWindow = Schema.decodeUnknownSync(
  Schema.Struct({
    decode_warning: Schema.Boolean,
    has_more: Schema.Boolean,
    next_offset: Schema.NullOr(count),
    offset: count,
    redacted: Schema.Boolean,
    returned_bytes: count,
    source_bytes: count,
    text: Schema.String,
    truncated: Schema.Boolean,
  })
);
/** Expose only the host-sanitized window and verified byte accounting. */
export const readGitlabLogs = Effect.fn("readGitlabLogs")(
  function* readGitlabLogs(
    args: typeof gitlabCiInputs.logs.Type,
    op: GitlabOperation
  ) {
    const offset = args.offset ?? 0;
    const maxBytes = args.max_bytes ?? 65_536;
    const wire = yield* gitlabOperationRequest(op, {
      jobId: args.job_id,
      kind: "logs",
      maxBytes,
      offset,
      projectId: op.context.project_id,
    }).pipe(Effect.flatMap(requireGitlabReply));
    const { decode_warning, ...window } = yield* decodeGitlabObservation(() => {
      const value = decodeWindow(wire.body);
      if (
        value.offset !== offset ||
        value.source_bytes > maxBytes ||
        value.returned_bytes !== Buffer.byteLength(value.text) ||
        value.returned_bytes > maxBytes ||
        value.truncated !== value.has_more ||
        value.next_offset !==
          (value.has_more ? offset + value.source_bytes : null) ||
        (value.has_more && value.source_bytes === 0)
      ) {
        throw new Error("MALFORMED_RESPONSE");
      }
      return value;
    });
    if (decode_warning) {
      op.warnings.push("Trace window includes malformed or split UTF-8 bytes.");
    }
    return { ...window, job_id: args.job_id };
  }
);
