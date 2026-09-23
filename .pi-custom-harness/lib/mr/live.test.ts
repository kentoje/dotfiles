import { expect, test } from "bun:test";
import { Effect } from "effect";

import { MergeRequestService } from "./core";
import {
  type MergeRequestCommandTransport,
  MergeRequestLiveLayerWithTransport,
} from "./live";

test("live MR boundary decodes a safe status payload", async () => {
  const transport: MergeRequestCommandTransport = () => {
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
});

test("live MR boundary retains command output on lookup failure", async () => {
  const transport: MergeRequestCommandTransport = () =>
    Effect.succeed({
      exitCode: 1,
      output: 'No open merge request available for "main".\n',
    });

  const failure = await Effect.runPromise(
    MergeRequestService.use((service) =>
      Effect.flip(service.statusFor({ cwd: "/workspace" })),
    ).pipe(Effect.provide(MergeRequestLiveLayerWithTransport(transport))),
  );

  expect(failure.message).toBe(
    'Merge request lookup failed: command exited with 1: No open merge request available for "main".',
  );
});
