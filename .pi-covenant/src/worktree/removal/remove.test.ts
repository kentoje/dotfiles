import { setTimeout as waitFor } from "node:timers/promises";

import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "../testing/fixture.js";

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

describe("worktree removal", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.safe-removal", async () => {
    const { writeFile, access, unlink } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "remove" }));
    if (!created.data) {
      throw new Error("Missing path");
    }
    const { path } = created.data;
    expect(
      (await Effect.runPromise(f.module.rm({ path: f.repositoryPath }))).status
    ).toBe("blocked");
    const loose = join(path, "untracked");
    await writeFile(loose, "keep");
    const dirty = await Effect.runPromise(f.module.rm({ path }));
    expect(dirty.status).toBe("blocked");
    expect(dirty.error?.code).toBe("DIRTY_WORKTREE");
    await access(loose);
    await unlink(loose);
    const clean = await Effect.runPromise(f.module.rm({ path }));
    expect(clean.status).toBe("ok");
    expect(clean.data).toStrictEqual({
      branch_deleted: false,
      path,
      removed: true,
    });
    expect(f.git(["branch", "--format=%(refname:short)"])).toContain("remove");
  });

  contractTest("worktree.protects-ahead-and-unknown", async () => {
    const { writeFile, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "ahead" }));
    if (!created.data) {
      throw new Error("Missing path");
    }
    const { path } = created.data;
    await writeFile(join(path, "tracked"), "unique");
    f.git(["add", "."], path);
    f.git(["commit", "-m", "unique"], path);
    const result = await Effect.runPromise(f.module.rm({ path }));
    expect(result.status).toBe("blocked");
    expect(result.error?.code).toBe("AHEAD_COMMITS");
    await access(path);
    const unknown = await Effect.runPromise(
      makeWorktreeModule({ ...f.host, defaultBase: "missing-ref" }).rm({ path })
    );
    expect(unknown.status).toBe("blocked");
    expect(unknown.error?.code).toBe("STATE_UNKNOWN");
    await access(path);
  });

  contractTest("worktree.repeat-removal-and-replacement", async () => {
    const { mkdir, writeFile, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const created = await Effect.runPromise(f.module.new({ task: "removed" }));
    if (!created.data) {
      throw new Error("Missing path");
    }
    const { path } = created.data;
    expect((await Effect.runPromise(f.module.rm({ path }))).status).toBe("ok");
    const repeated = await Effect.runPromise(f.module.rm({ path }));
    expect(repeated.status).toBe("ok");
    expect(repeated.data?.removed).toBeFalsy();
    await mkdir(path);
    await writeFile(join(path, "user-source"), "keep");
    expect((await Effect.runPromise(f.module.rm({ path }))).status).toBe(
      "blocked"
    );
    await access(join(path, "user-source"));
  });

  contractTest("worktree.protects-locked-and-current", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const { mkdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const result = await Effect.runPromise(f.module.new({ task: "protected" }));
    if (!result.data) {
      throw new Error("Missing path");
    }
    const { path } = result.data;
    f.git(["worktree", "lock", path]);
    expect((await Effect.runPromise(f.module.rm({ path }))).error?.code).toBe(
      "LOCKED_WORKTREE"
    );
    expect(
      (await Effect.runPromise(f.module.list({}))).warnings.join(",")
    ).toContain("locked");
    f.git(["worktree", "unlock", path]);
    await mkdir(join(path, "nested"));
    const active = makeWorktreeModule({
      ...f.host,
      sessionCwd: join(path, "nested"),
    });
    expect((await Effect.runPromise(active.rm({ path }))).error?.code).toBe(
      "CURRENT_WORKTREE"
    );
  });

  contractTest("worktree.cancellation-retains-removal-effect", async () => {
    const { writeFile, mkdir, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { execFileSync } = await import("node:child_process");
    const f = await fixture();
    const result = await Effect.runPromise(
      f.module.new({ task: "remove-cancel" })
    );
    if (!result.data) {
      throw new Error("Missing path");
    }
    const realGit = execFileSync("which", ["git"], {
      encoding: "utf-8",
    }).trim();
    const bin = join(f.temp, "bin");
    await mkdir(bin);
    const marker = join(f.temp, "removed");
    await writeFile(
      join(bin, "git"),
      `#!/bin/sh
${quote(realGit)} "$@"
code=$?
if [ "$code" -eq 0 ]; then
  previous=
  for argument in "$@"; do
    if [ "$previous" = worktree ] && [ "$argument" = remove ]; then
      printf done > ${quote(marker)}
      exec sleep 60
    fi
    previous=$argument
  done
fi
exit "$code"
`,
      { mode: 0o755 }
    );
    const previous = process.env.PATH;
    const controller = new AbortController();
    try {
      process.env.PATH = `${bin}:${previous}`;
      const pending = Effect.runPromise(
        f.module.rm(
          { path: result.data.path },
          { deadline: Date.now() + 12_000, signal: controller.signal }
        )
      );
      for (let i = 0; i < 300; i += 1) {
        if (
          await access(marker).then(
            () => true,
            () => false
          )
        ) {
          break;
        }
        await waitFor(20);
      }
      await access(marker);
      controller.abort();
      const removed = await pending;
      expect(removed.status).toBe("partial");
      expect(removed.error?.code).toBe("CANCELLED");
      expect(removed.data?.removed).toBeTruthy();
      expect(removed.completed_effects).toContainEqual(
        expect.objectContaining({ outcome: "committed", phase: "remove" })
      );
    } finally {
      if (previous === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previous;
      }
      controller.abort();
    }
  });
});
