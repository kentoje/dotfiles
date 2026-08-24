import { spawn } from "node:child_process";
import { basename } from "node:path";

import { Effect, Layer } from "effect";
import type { RepositoryFacts } from "../repo-map/core";
import {
  PreviewPortlessError,
  PreviewPortlessService,
  type PreviewProcessCommand,
  PreviewProcessError,
  type PreviewProcessHandle,
  PreviewProcessService,
  type PreviewRouteStatus,
} from "./core";

const describeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const routeNameFor = (cwd: string, facts: RepositoryFacts): string => {
  const worktreeName = basename(cwd);
  return worktreeName === facts.portlessAppName
    ? facts.portlessAppName
    : `${worktreeName}.${facts.portlessAppName}`;
};

const processFailure = (cause: unknown): PreviewProcessError =>
  new PreviewProcessError({
    message: `Preview process failed: ${describeFailure(cause)}`,
  });

const runPortlessGet = (routeName: string, cwd: string) =>
  Effect.tryPromise({
    try: () =>
      new Promise<{ readonly exitCode: number; readonly output: string }>(
        (resolve, reject) => {
          const child = spawn("portless", ["get", routeName], { cwd });
          let output = "";
          child.stdout.on("data", (chunk: Buffer) => {
            output += chunk.toString();
          });
          child.stderr.on("data", (chunk: Buffer) => {
            output += chunk.toString();
          });
          child.once("error", reject);
          child.once("close", (exitCode) =>
            resolve({ exitCode: exitCode ?? 1, output }),
          );
        },
      ),
    catch: (cause) =>
      new PreviewPortlessError({
        message: `Preview portless lookup failed: ${describeFailure(cause)}`,
      }),
  });

const parsePortlessUrl = (output: string): string | undefined => {
  const candidate = output.match(/https?:\/\/[^\s"']+/u)?.[0];
  if (candidate === undefined) return undefined;
  try {
    return new URL(candidate).toString();
  } catch {
    return undefined;
  }
};

const routeReady = (url: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      try {
        await fetch(url, { signal: controller.signal });
        return true;
      } finally {
        clearTimeout(timeout);
      }
    },
    catch: (cause) =>
      new PreviewPortlessError({
        message: `Preview route readiness check failed: ${describeFailure(cause)}`,
      }),
  }).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: (ready) => ready,
    }),
  );

const makePortlessService = () =>
  PreviewPortlessService.of({
    resolveRoute: ({ cwd, facts }) => {
      const routeName = routeNameFor(cwd, facts);
      return runPortlessGet(routeName, cwd).pipe(
        Effect.flatMap((result) => {
          const url = parsePortlessUrl(result.output);
          if (result.exitCode !== 0 || url === undefined) {
            return Effect.fail(
              new PreviewPortlessError({
                message: `Preview portless route lookup failed for ${routeName}.`,
              }),
            );
          }
          return routeReady(url).pipe(
            Effect.map(
              (ready): PreviewRouteStatus => ({
                url,
                ready,
                running: ready,
                routeName,
              }),
            ),
          );
        }),
      );
    },
  });

export interface PreviewManagedProcess {
  readonly kill: (signal: NodeJS.Signals) => boolean;
  readonly once: {
    (event: "error", listener: (cause: Error) => void): PreviewManagedProcess;
    (event: "spawn", listener: () => void): PreviewManagedProcess;
    (event: "close", listener: () => void): PreviewManagedProcess;
  };
}

export type PreviewProcessSpawner = (
  input: PreviewProcessCommand,
) => PreviewManagedProcess;

const spawnPreviewProcess: PreviewProcessSpawner = (input) =>
  spawn(input.program, [...input.arguments_], { cwd: input.cwd });

const startProcess = (
  input: PreviewProcessCommand,
  processes: Set<PreviewManagedProcess>,
  spawnProcess: PreviewProcessSpawner,
) =>
  Effect.tryPromise({
    try: () =>
      new Promise<PreviewProcessHandle>((resolve, reject) => {
        const child = spawnProcess(input);
        const onAbort = () => {
          child.kill("SIGTERM");
        };
        input.signal?.addEventListener("abort", onAbort, { once: true });
        const remove = () => {
          processes.delete(child);
          input.signal?.removeEventListener("abort", onAbort);
        };
        child.once("error", (cause) => {
          remove();
          reject(cause);
        });
        child.once("spawn", () => {
          processes.add(child);
          child.once("close", remove);
          resolve({
            stop: () =>
              Effect.tryPromise({
                try: () =>
                  new Promise<void>((stopResolve) => {
                    child.once("close", () => stopResolve());
                    child.kill("SIGTERM");
                  }),
                catch: processFailure,
              }),
          });
        });
      }),
    catch: processFailure,
  });

export interface PreviewLiveRuntimeOptions {
  readonly spawnProcess?: PreviewProcessSpawner;
}

export interface PreviewLiveRuntime {
  readonly layer: Layer.Layer<PreviewPortlessService | PreviewProcessService>;
  readonly stopAll: () => void;
}

/** Builds isolated live services and cleanup for one Pi extension session. */
export const makePreviewLiveRuntime = ({
  spawnProcess = spawnPreviewProcess,
}: PreviewLiveRuntimeOptions = {}): PreviewLiveRuntime => {
  const processes = new Set<PreviewManagedProcess>();
  const stopAll = (): void => {
    for (const child of processes) child.kill("SIGTERM");
    processes.clear();
  };

  return {
    layer: Layer.mergeAll(
      Layer.succeed(PreviewPortlessService, makePortlessService()),
      Layer.succeed(PreviewProcessService, {
        start: (input: PreviewProcessCommand) =>
          startProcess(input, processes, spawnProcess),
        stopAll: () => Effect.sync(stopAll),
      }),
    ),
    stopAll,
  };
};

/** Compatibility layer built from one runtime for existing callers and tests. */
export const PreviewLiveLayer = makePreviewLiveRuntime().layer;
