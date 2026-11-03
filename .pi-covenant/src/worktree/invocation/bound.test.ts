import { setTimeout as waitFor } from "node:timers/promises";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "../testing/fixture.js";

describe("worktree invocation", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.cancels-owned-setup", async () => {
    const { writeFile, readFile, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const script = join(f.temp, "slow.cjs");
    const started = join(f.temp, "started");
    const escaped = join(f.temp, "escaped");
    await writeFile(
      script,
      `const {spawn}=require('node:child_process');require('node:fs').writeFileSync(${JSON.stringify(started)},String(process.pid));spawn(process.execPath,['-e',${JSON.stringify(`process.on('SIGTERM',()=>{});setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(escaped)},'escaped'),1500);setInterval(()=>{},1000);`)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`
    );
    const controller = new AbortController();
    const module = makeWorktreeModule({
      ...f.host,
      setup: {
        args: [script],
        command: process.execPath,
        kind: "after-create",
      },
    });
    const pending = Effect.runPromise(
      module.new(
        { task: "cancelled" },
        { deadline: Date.now() + 12_000, signal: controller.signal }
      )
    );
    for (let i = 0; i < 300; i += 1) {
      if (
        await access(started).then(
          () => true,
          () => false
        )
      ) {
        break;
      }
      await waitFor(20);
    }
    await access(started);
    const path = join(f.root, "fixture", "cancelled");
    await writeFile(join(path, "user-work"), "preserve");
    controller.abort();
    const result = await pending;
    expect(result.status).toBe("partial");
    expect(result.error?.code).toBe("CANCELLED");
    await expect(readFile(join(path, "user-work"), "utf-8")).resolves.toBe(
      "preserve"
    );
    const pid = Number(await readFile(started, "utf-8"));
    expect(() => process.kill(pid, 0)).toThrow(/ESRCH/u);
    await waitFor(1600);
    await expect(
      access(escaped).then(
        () => true,
        () => false
      )
    ).resolves.toBeFalsy();
  });

  contractTest("worktree.honors-cancellation-and-deadline", async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort();
    const cancelled = await Effect.runPromise(
      f.module.new({ task: "never" }, { signal: controller.signal })
    );
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.completed_effects).toStrictEqual([]);
    const expired = await Effect.runPromise(
      f.module.new({ task: "expired" }, { deadline: Date.now() - 1 })
    );
    expect(expired.error?.code).toBe("DEADLINE_EXCEEDED");
    expect(expired.completed_effects).toStrictEqual([]);
    expect(f.git(["branch", "--format=%(refname:short)"])).toBe("main");
  });

  contractTest("worktree.reports-lock-cleanup-failure", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const { readFile } = await import("node:fs/promises");
    const f = await fixture();
    const lock = `${f.git(["rev-parse", "--path-format=absolute", "--git-common-dir"])}/pi-covenant-worktrees.lock`;
    const script = `const fs=require('node:fs');fs.rmdirSync(${JSON.stringify(lock)});fs.writeFileSync(${JSON.stringify(lock)},'replacement');`;
    const module = makeWorktreeModule({
      ...f.host,
      setup: {
        args: ["-e", script],
        command: process.execPath,
        kind: "after-create",
      },
    });
    const result = await Effect.runPromise(module.new({ task: "cleanup" }));
    expect(result.status).toBe("partial");
    expect(result.error?.code).toBe("CLEANUP_FAILED");
    await expect(readFile(lock, "utf-8")).resolves.toBe("replacement");
  });
});
