import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";

const cases = [
  ["/Volumes/HomeX/kento/.pi/worktrees/conversation-center-ext/campaigns-filter", "pnpm", ["run", "ts:check"]],
  ["/Volumes/HomeX/kento/.pi/worktrees/conversation-center-ext/campaigns-filter", "git", ["rev-parse", "--show-toplevel"]],
];

const program = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  for (const [cwd, prog, args] of cases as [string, string, string[]][]) {
    const cmd = ChildProcess.make(prog, args, { cwd });
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(cmd);
        const out = yield* handle.all.pipe(Stream.decodeText(), Stream.runCollect);
        const code = yield* handle.exitCode;
        return { code, out: Array.from(out).join("").slice(0, 80) };
      }),
    ).pipe(Effect.match({ onSuccess: (v) => ({ ok: true as const, v }), onFailure: (e) => ({ ok: false as const, e }) }));
    console.log(JSON.stringify({ cwd, prog, result }, null, 1).slice(0, 700));
  }
});

Effect.runPromise(program.pipe(Effect.provide(BunServicesLayer)));
