import { contractTest } from "@covenant/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installWorktreeFixtures } from "../testing/fixture.js";

describe("worktree creation", () => {
  const fixture = installWorktreeFixtures();
  contractTest("worktree.safe-creation", async () => {
    const f = await fixture();
    for (const task of [
      "../escape",
      "/absolute",
      "a/b",
      "a\\b",
      ".",
      "..",
      "-bad",
    ]) {
      const result = await Effect.runPromise(f.module.new({ task }));
      expect(result.status).toBe("blocked");
      expect(f.git(["branch", "--format=%(refname:short)"])).toBe("main");
    }
    const result = await Effect.runPromise(f.module.new({ task: "CI-123" }));
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      branch: "CI-123",
      readiness: "not_configured",
    });
  });

  contractTest("worktree.repository-setup", async () => {
    const { writeFile, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const script = join(f.repositoryPath, "setup.cjs");
    await writeFile(
      script,
      "require('node:fs').writeFileSync('installed', process.env.PI_WORKTREE_BRANCH);\n"
    );
    const module = makeWorktreeModule({
      ...f.host,
      requiredArtifacts: ["installed"],
      setup: {
        args: [script],
        command: process.execPath,
        kind: "after-create",
      },
    });
    const result = await Effect.runPromise(module.new({ task: "setup-task" }));
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      readiness: "ready",
      setup_completed: true,
    });
    if (!result.data) {
      throw new Error("Missing created worktree");
    }
    await expect(
      readFile(join(result.data.path, "installed"), "utf-8")
    ).resolves.toBe("setup-task");
  });

  contractTest("worktree.reuses-existing", async () => {
    const f = await fixture();
    const first = await Effect.runPromise(f.module.new({ task: "repeat" }));
    const second = await Effect.runPromise(f.module.new({ task: "repeat" }));
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(second.data).toStrictEqual(first.data);
    const conflict = await Effect.runPromise(
      f.module.new({ branch: "different", task: "repeat" })
    );
    expect(conflict.status).toBe("blocked");
    expect(f.git(["branch", "--format=%(refname:short)"])).not.toContain(
      "different"
    );
  });

  contractTest("worktree.retains-partial-setup", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const { access } = await import("node:fs/promises");
    const f = await fixture();
    const module = makeWorktreeModule({
      ...f.host,
      setup: {
        args: ["-e", "process.exit(17)"],
        command: process.execPath,
        kind: "after-create",
      },
    });
    const result = await Effect.runPromise(module.new({ task: "recover" }));
    expect(result.status).toBe("partial");
    expect(result.error?.code).toBe("SETUP_FAILED");
    expect(result.data).toMatchObject({
      branch: "recover",
      readiness: "setup_failed",
    });
    if (!result.data) {
      throw new Error("Missing retained path");
    }
    await access(result.data.path);
    expect(result.completed_effects).toContainEqual(
      expect.objectContaining({
        outcome: "committed",
        target: result.data.path,
      })
    );
  });

  contractTest("worktree.delegates-creation", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const script = join(f.repositoryPath, "create.cjs");
    await writeFile(
      script,
      "require('node:child_process').execFileSync('git',['-c','core.hooksPath=/dev/null','worktree','add','-b',process.env.PI_WORKTREE_BRANCH,process.env.PI_WORKTREE_PATH,process.env.PI_WORKTREE_BASE]);"
    );
    const result = await Effect.runPromise(
      makeWorktreeModule({
        ...f.host,
        setup: {
          args: [script],
          command: process.execPath,
          kind: "creates-worktree",
        },
      }).new({ task: "delegated" })
    );
    expect(result.status).toBe("ok");
    expect(result.data).toMatchObject({
      branch: "delegated",
      setup_completed: true,
    });
  });

  contractTest("worktree.preserves-other-checkouts", async () => {
    const { writeFile, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    f.git(["remote", "add", "origin", "ssh://unreachable.invalid/repo"]);
    await writeFile(join(f.repositoryPath, "tracked"), "user edits");
    await writeFile(join(f.repositoryPath, "untracked"), "user source");
    const before = f.git(["status", "--porcelain=v1"]);
    const result = await Effect.runPromise(f.module.new({ task: "isolated" }));
    expect(result.status).toBe("ok");
    expect(f.git(["status", "--porcelain=v1"])).toBe(before);
    await expect(
      readFile(join(f.repositoryPath, "tracked"), "utf-8")
    ).resolves.toBe("user edits");
    const unavailable = await Effect.runPromise(
      f.module.new({ base: "origin/not-fetched", task: "unavailable" })
    );
    expect(unavailable.status).toBe("blocked");
    expect(unavailable.error?.code).toBe("BASE_UNAVAILABLE");
  });

  contractTest("worktree.serializes-mutations", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const module = makeWorktreeModule({
      ...f.host,
      setup: {
        args: ["-e", "setTimeout(()=>{},100)"],
        command: process.execPath,
        kind: "after-create",
      },
    });
    const results = await Promise.all([
      Effect.runPromise(module.new({ task: "concurrent" })),
      Effect.runPromise(module.new({ task: "concurrent" })),
    ]);
    expect(results.filter((result) => result.status === "ok")).toHaveLength(1);
    expect(
      results.filter((result) => result.error?.code === "RESOURCE_BUSY")
    ).toHaveLength(1);
    expect(results.every((result) => result.status !== "partial")).toBeTruthy();
  });

  contractTest("worktree.rejects-symlink-and-conflicting-target", async () => {
    const { symlink, mkdir, access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const outside = join(f.temp, "outside-path");
    await mkdir(outside);
    await mkdir(join(f.root, "fixture"));
    await symlink(outside, join(f.root, "fixture", "escape"));
    const escaped = await Effect.runPromise(f.module.new({ task: "escape" }));
    expect(escaped.status).toBe("blocked");
    expect(escaped.error?.code).toBe("UNSAFE_PATH");
    await access(outside);
    expect(
      (
        await Effect.runPromise(
          f.module.new({ repository: "wrong", task: "other" })
        )
      ).error?.code
    ).toBe("CONTEXT_CONFLICT");
    expect(
      (await Effect.runPromise(f.module.new({ cwd: outside, task: "other" })))
        .error?.code
    ).toBe("CONTEXT_CONFLICT");
    expect(
      (
        await Effect.runPromise(
          f.module.new({ branch: "--orphan", task: "other" })
        )
      ).status
    ).toBe("blocked");
    expect(f.git(["branch", "--format=%(refname:short)"])).toBe("main");
  });

  contractTest("worktree.reuses-without-setup", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const { writeFile, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const f = await fixture();
    const script = join(f.temp, "count.cjs");
    const count = join(f.temp, "count");
    await writeFile(
      script,
      `require('node:fs').appendFileSync(${JSON.stringify(count)},'once');`
    );
    const module = makeWorktreeModule({
      ...f.host,
      setup: {
        args: [script],
        command: process.execPath,
        kind: "after-create",
      },
    });
    expect((await Effect.runPromise(module.new({ task: "once" }))).status).toBe(
      "ok"
    );
    const repeated = await Effect.runPromise(module.new({ task: "once" }));
    expect(repeated.status).toBe("ok");
    expect(repeated.data?.setup_completed).toBeTruthy();
    expect(repeated.completed_effects).toStrictEqual([]);
    await expect(readFile(count, "utf-8")).resolves.toBe("once");
  });

  contractTest("worktree.setup-launch-and-readback-failure", async () => {
    const { makeWorktreeModule } = await import("../module-port.js");
    const f = await fixture();
    const result = await Effect.runPromise(
      makeWorktreeModule({
        ...f.host,
        setup: {
          args: [],
          command: "/does-not-exist/covenant-setup",
          kind: "after-create",
        },
      }).new({ task: "launch-failure" })
    );
    expect(result.status).toBe("partial");
    expect(result.error?.code).toBe("SETUP_FAILED");
    if (!result.data) {
      throw new Error("Missing retained checkout");
    }
    const inspected = await Effect.runPromise(
      f.module.verify({ path: result.data.path })
    );
    expect(inspected.data?.worktree.readiness).toBe("setup_failed");
  });

  contractTest("worktree.ignores-ambient-git-target", async () => {
    const selected = await fixture();
    const ambient = await fixture();
    const previous = process.env.GIT_DIR;
    try {
      process.env.GIT_DIR = ambient.git(["rev-parse", "--absolute-git-dir"]);
      const result = await Effect.runPromise(
        selected.module.new({ task: "selected-only" })
      );
      expect(result.status).toBe("ok");
    } finally {
      if (previous === undefined) {
        delete process.env.GIT_DIR;
      } else {
        process.env.GIT_DIR = previous;
      }
    }
    expect(selected.git(["branch", "--format=%(refname:short)"])).toContain(
      "selected-only"
    );
    expect(ambient.git(["branch", "--format=%(refname:short)"])).toBe("main");
  });
});
