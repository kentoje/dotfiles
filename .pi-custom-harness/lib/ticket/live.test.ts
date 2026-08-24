import { expect, test } from "bun:test";
import { Effect } from "effect";
import { TicketService } from "./core";
import {
  TicketLiveLayerWithOperations,
  type TicketStateOperations,
} from "./live";

test("ticket live layer binds a validated key and persists its branch association", async () => {
  const files = new Map<string, string>();
  const worktree = "/tmp/ticket-contract/worktree";
  const operations: TicketStateOperations = {
    pathExists: (path) => Effect.succeed(path === worktree || files.has(path)),
    readText: (path) => Effect.succeed(files.get(path) ?? ""),
    writeText: (path, content) =>
      Effect.sync(() => {
        files.set(path, content);
      }),
    currentBranch: () => Effect.succeed("feature/TICKET-42"),
  };

  const binding = await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* TicketService;
      return yield* service.bind({ cwd: worktree, ticketKey: "PROJ-42" });
    }).pipe(Effect.provide(TicketLiveLayerWithOperations(operations))),
  );

  expect(binding).toEqual({
    ticketKey: "PROJ-42",
    branch: "feature/TICKET-42",
    worktree,
  });
  expect(files.get(`${worktree}/.dev-flow.json`)).toContain('"key": "PROJ-42"');
});
