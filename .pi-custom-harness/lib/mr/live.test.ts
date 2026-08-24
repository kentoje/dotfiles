import { expect, test } from "bun:test";
import { Effect } from "effect";

import { MergeRequestService } from "./core";
import {
  type MergeRequestCommandRequest,
  type MergeRequestCommandTransport,
  MergeRequestLiveLayerWithTransport,
} from "./live";

test("live MR boundary reads a safe status payload without mutating GitLab", async () => {
  const requests: Array<MergeRequestCommandRequest> = [];
  const transport: MergeRequestCommandTransport = (request) => {
    requests.push(request);
    return Effect.succeed({
      exitCode: 0,
      output: JSON.stringify({
        iid: 19,
        title: "Fix MR boundary",
        draft: false,
        discussions_ok: true,
        unresolved_count: 0,
        bound_ticket: "DASH-19",
        pipeline: { status: "success" },
      }),
    });
  };

  const status = await Effect.runPromise(
    MergeRequestService.use((service) =>
      service.statusFor({ cwd: "/workspace" }),
    ).pipe(Effect.provide(MergeRequestLiveLayerWithTransport(transport))),
  );

  expect(status).toEqual({
    iid: 19,
    title: "Fix MR boundary",
    draft: false,
    discussionsOk: true,
    pipelineState: "success",
    unresolvedCount: 0,
    boundTicket: "DASH-19",
  });
  expect(requests).toEqual([
    {
      cwd: "/workspace",
      arguments_: ["api", "merge_requests", "--current", "--output", "json"],
    },
  ]);
});
