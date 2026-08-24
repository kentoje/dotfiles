import { expect, test } from "bun:test";
import { Effect } from "effect";

import { type PreviewProcessHandle, PreviewProcessService } from "./core";
import {
  makePreviewLiveRuntime,
  type PreviewLiveRuntime,
  type PreviewManagedProcess,
} from "./live";

class FakePreviewProcess implements PreviewManagedProcess {
  killed = 0;
  private readonly closeListeners = new Set<() => void>();

  kill(_signal: NodeJS.Signals): boolean {
    this.killed += 1;
    for (const listener of this.closeListeners) listener();
    return true;
  }

  once(event: "error", listener: (cause: Error) => void): this;
  once(event: "spawn", listener: () => void): this;
  once(event: "close", listener: () => void): this;
  once(
    event: "error" | "spawn" | "close",
    listener: (...args: never[]) => void,
  ): this {
    if (event === "spawn") listener();
    if (event === "close") this.closeListeners.add(listener);
    return this;
  }
}

test("preview runtimes stop only their own processes", async () => {
  const firstProcess = new FakePreviewProcess();
  const secondProcess = new FakePreviewProcess();
  const firstRuntime = makePreviewLiveRuntime({
    spawnProcess: () => firstProcess,
  });
  const secondRuntime = makePreviewLiveRuntime({
    spawnProcess: () => secondProcess,
  });

  const start = (runtime: PreviewLiveRuntime) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* PreviewProcessService;
        return yield* service.start({
          program: "fake-preview",
          arguments_: [],
          cwd: "/tmp/preview-contract",
          routeName: "contract.example",
        });
      }).pipe(Effect.provide(runtime.layer)),
    );

  await start(firstRuntime);
  await start(secondRuntime);
  firstRuntime.stopAll();

  expect(firstProcess.killed).toBe(1);
  expect(secondProcess.killed).toBe(0);

  secondRuntime.stopAll();
  expect(secondProcess.killed).toBe(1);
});
test("preview process service starts and stops through its injected handle", async () => {
  let stopped = false;
  const handle: PreviewProcessHandle = {
    stop: () =>
      Effect.sync(() => {
        stopped = true;
      }),
  };

  await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* PreviewProcessService;
      const process = yield* service.start({
        program: "fake-preview",
        arguments_: [],
        cwd: "/tmp/preview-contract",
        routeName: "contract.example",
      });
      yield* process.stop();
      yield* service.stopAll();
    }).pipe(
      Effect.provideService(PreviewProcessService, {
        start: () => Effect.succeed(handle),
        stopAll: () => Effect.void,
      }),
    ),
  );

  expect(stopped).toBe(true);
});
